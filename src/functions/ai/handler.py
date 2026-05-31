# devflow-ai-api: LangGraph Agent Lambda ハンドラー
# DET-001: SSE形式でストリーミングレスポンスを返す
# CLAUDE.md: ユーザー入力は HumanMessage に完全隔離
from __future__ import annotations

import json
import os
import time
from typing import Any
from uuid import uuid4
from datetime import datetime, timezone

import boto3
from langchain_core.messages import HumanMessage

from agent import AGENT
from input_filter import validate_user_input
from output_sanitizer import sanitize_llm_output

_TABLE  = os.environ.get("DYNAMODB_TABLE_NAME", "")
_REGION = os.environ.get("AWS_REGION", "ap-northeast-1")
_dynamodb = boto3.resource("dynamodb", region_name=_REGION)


def _get_claims(event: dict) -> dict:
    return event.get("requestContext", {}).get("authorizer", {}).get("claims", {})


def _sse(event_name: str, data: dict) -> str:
    return f"event: {event_name}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _save_messages(session_id: str, user_msg: str, assistant_msg: str, ttl: int) -> None:
    table = _dynamodb.Table(_TABLE)
    now = datetime.now(timezone.utc).isoformat()
    for role, content in [("user", user_msg), ("assistant", assistant_msg)]:
        msg_id = str(uuid4())
        ts = datetime.now(timezone.utc).isoformat()
        table.put_item(Item={
            "pk": f"SESSION#{session_id}",
            "sk": f"MSG#{ts}#{msg_id}",
            "message_id": msg_id,
            "session_id": session_id,
            "role": role,
            "content": content,
            "ttl": ttl,
            "created_at": now,
        })


def _ensure_session(session_id: str, user_id: str) -> int:
    """セッションが存在しない場合は作成し、TTL（90日後epoch）を返す"""
    table = _dynamodb.Table(_TABLE)
    ttl = int(time.time()) + 90 * 24 * 60 * 60
    now = datetime.now(timezone.utc).isoformat()
    table.update_item(
        Key={"pk": f"SESSION#{session_id}", "sk": f"SESSION#{session_id}"},
        UpdateExpression="SET #uid=if_not_exists(#uid,:uid), title=if_not_exists(title,:title), "
                         "session_id=if_not_exists(session_id,:sid), gsi1pk=if_not_exists(gsi1pk,:g1pk), "
                         "gsi2pk=if_not_exists(gsi2pk,:g2pk), created_at=if_not_exists(created_at,:now), "
                         "updated_at=:now, #ttl=:ttl",
        ExpressionAttributeNames={"#uid": "user_id", "#ttl": "ttl"},
        ExpressionAttributeValues={
            ":uid": user_id, ":title": "新しい会話", ":sid": session_id,
            ":g1pk": "SESSION", ":g2pk": f"USER#{user_id}",
            ":now": now, ":ttl": ttl,
        },
    )
    return ttl


# ─── POST /api/v1/ai/chat ──────────────────────────────────
def handle_chat(event: dict) -> dict:
    claims = _get_claims(event)
    user_id = claims.get("sub", "")

    body = json.loads(event.get("body") or "{}")
    message  = body.get("message", "")
    session_id = body.get("session_id") or str(uuid4())
    context  = body.get("context")  # { type, id } 任意

    # ① 入力バリデーション（OWASP LLM01）
    is_valid, err_msg = validate_user_input(message)
    if not is_valid:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": {"code": "INVALID_INPUT", "message": err_msg}}, ensure_ascii=False),
        }

    ttl = _ensure_session(session_id, user_id)

    # ② ユーザーコンテキスト取得（権限範囲の確認）
    from tools import get_user_context as _get_ctx  # 型エラー回避のためローカルimport
    ctx_raw = _get_ctx.invoke({"user_id": user_id})
    user_context = json.loads(ctx_raw)
    user_context["user_id"] = user_id

    # ③ ユーザー入力を HumanMessage に完全隔離（CLAUDE.md: SystemPrompt と連結禁止）
    human_msg = HumanMessage(content=message)

    # コンテキスト連携（SCR-004「AIで分析」等から遷移時）
    if context:
        human_msg = HumanMessage(
            content=f"[参照対象: {context.get('type')} ID={context.get('id')}]\n\n{message}"
        )

    # ④ LangGraph Agent 実行（recursion_limit=20 は CLAUDE.md 規定）
    sse_chunks: list[str] = []
    full_response = ""

    try:
        result = AGENT.invoke(
            {
                "messages": [human_msg],
                "user_context": user_context,
                "tool_results": [],
                "step_count": 0,
                "session_id": session_id,
            },
            config={"recursion_limit": 20},
        )

        # エージェントステップをSSEに変換
        step_num = 0
        for msg in result["messages"]:
            if hasattr(msg, "tool_calls") and msg.tool_calls:
                for tc in msg.tool_calls:
                    step_num += 1
                    sse_chunks.append(_sse("agent_step", {
                        "type": "agent_step",
                        "data": {
                            "step": step_num,
                            "tool": _tool_label(tc["name"]),
                        },
                    }))

        # 最終応答テキスト抽出
        last = result["messages"][-1]
        raw_content = last.content if hasattr(last, "content") else str(last)
        if isinstance(raw_content, list):
            raw_content = " ".join(
                c.get("text", "") if isinstance(c, dict) else str(c) for c in raw_content
            )

        # ⑤ PII サニタイズ（OWASP LLM02）
        full_response = sanitize_llm_output(str(raw_content))

        # テキストを50文字単位でストリーミング形式に分割
        chunk_size = 50
        for i in range(0, len(full_response), chunk_size):
            sse_chunks.append(_sse("text_chunk", {
                "type": "text_chunk",
                "data": {"text": full_response[i:i + chunk_size]},
            }))

        message_id = str(uuid4())
        sse_chunks.append(_sse("done", {
            "type": "done",
            "data": {
                "session_id": session_id,
                "message_id": message_id,
                "total_tokens": len(message) + len(full_response),
            },
        }))

    except TimeoutError:
        sse_chunks.append(_sse("error", {
            "type": "error",
            "data": {"code": "BEDROCK_TIMEOUT", "message": "AI処理がタイムアウトしました"},
        }))
    except Exception as e:
        sse_chunks.append(_sse("error", {
            "type": "error",
            "data": {"code": "INTERNAL_ERROR", "message": str(e)},
        }))

    # ⑥ 会話履歴を DynamoDB に保存
    if full_response:
        _save_messages(session_id, message, full_response, ttl)

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
        "body": "".join(sse_chunks),
    }


def _tool_label(tool_name: str) -> str:
    return {
        "get_projects":       "案件データを取得中",
        "get_tasks":          "タスクデータを取得中",
        "get_documents":      "ドキュメントを参照中",
        "aggregate_metrics":  "KPIを集計中",
        "get_user_context":   "権限情報を確認中",
        "save_report":        "レポートを保存中",
    }.get(tool_name, tool_name)


# ─── GET /api/v1/ai/chat/sessions ─────────────────────────
def handle_list_sessions(event: dict) -> dict:
    claims = _get_claims(event)
    user_id = claims.get("sub", "")

    from boto3.dynamodb.conditions import Key as _Key
    table = _dynamodb.Table(_TABLE)
    resp = table.query(
        IndexName="user-entity-index",
        KeyConditionExpression=_Key("gsi2pk").eq(f"USER#{user_id}") & _Key("sk").begins_with("SESSION#"),
        ScanIndexForward=False,
    )
    items = [
        {
            "session_id": i.get("session_id"),
            "title": i.get("title"),
            "updated_at": i.get("updated_at"),
        }
        for i in resp.get("Items", [])
    ]
    return {"statusCode": 200, "headers": {"Content-Type": "application/json"}, "body": json.dumps({"items": items}, ensure_ascii=False)}


# ─── GET /api/v1/ai/chat/sessions/{id}/messages ───────────
def handle_list_messages(event: dict, session_id: str) -> dict:
    claims = _get_claims(event)
    user_id = claims.get("sub", "")

    from boto3.dynamodb.conditions import Key as _Key
    table = _dynamodb.Table(_TABLE)

    # セッションの所有者確認（他人のセッションアクセス禁止）
    session_resp = table.get_item(Key={"pk": f"SESSION#{session_id}", "sk": f"SESSION#{session_id}"})
    session = session_resp.get("Item")
    if not session or session.get("user_id") != user_id:
        return {"statusCode": 403, "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": {"code": "FORBIDDEN", "message": "アクセス権限がありません"}}, ensure_ascii=False)}

    resp = table.query(
        KeyConditionExpression=_Key("pk").eq(f"SESSION#{session_id}") & _Key("sk").begins_with("MSG#"),
        ScanIndexForward=True,
    )
    items = [{"message_id": i.get("message_id"), "role": i.get("role"),
              "content": i.get("content"), "created_at": i.get("created_at")}
             for i in resp.get("Items", [])]
    return {"statusCode": 200, "headers": {"Content-Type": "application/json"}, "body": json.dumps({"items": items}, ensure_ascii=False)}


# ─── Lambda エントリーポイント ──────────────────────────────
def lambda_handler(event: dict, _context: Any) -> dict:
    method = event.get("httpMethod", "")
    path   = event.get("path", "")

    if method == "POST" and path.endswith("/ai/chat"):
        return handle_chat(event)
    if method == "GET" and "/ai/chat/sessions" in path and "/messages" in path:
        session_id = event.get("pathParameters", {}).get("id", "")
        return handle_list_messages(event, session_id)
    if method == "GET" and path.endswith("/ai/chat/sessions"):
        return handle_list_sessions(event)

    return {"statusCode": 404, "body": json.dumps({"error": {"code": "NOT_FOUND", "message": "エンドポイントが見つかりません"}})}
