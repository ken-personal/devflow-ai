# DET-001 5.2: LangGraph Agent ツール一覧（6本）
# CLAUDE.md: ツールは原則 Read Only。save_report のみ Write

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

import boto3
from boto3.dynamodb.conditions import Key, Attr
from langchain_core.tools import tool
from pydantic import BaseModel, Field

_TABLE_NAME = os.environ.get("DYNAMODB_TABLE_NAME", "")
_S3_BUCKET  = os.environ.get("S3_BUCKET_NAME", "")
_REGION     = os.environ.get("AWS_REGION", "ap-northeast-1")

def _get_table():
    dynamodb = boto3.resource("dynamodb", region_name=_REGION)
    return dynamodb.Table(_TABLE_NAME)


# ─── get_projects ──────────────────────────────────────────
class GetProjectsInput(BaseModel):
    project_ids: Optional[list[str]] = Field(None, description="取得する案件IDのリスト（省略時は権限範囲の全件）")
    status: Optional[str] = Field(None, description="ステータスフィルタ: planning/active/review/hold/delayed")
    limit: int = Field(20, description="最大取得件数", le=100)


@tool("get_projects", args_schema=GetProjectsInput)
def get_projects(
    project_ids: Optional[list[str]] = None,
    status: Optional[str] = None,
    limit: int = 20,
    # user_context は agent から注入される（ツール呼び出し時に state から渡す）
    _allowed_project_ids: Optional[list[str]] = None,
) -> str:
    """案件データを取得・フィルタする（Read Only）"""
    table = _get_table()
    results = []

    targets = project_ids or _allowed_project_ids or []

    for pid in targets[:limit]:
        resp = table.get_item(Key={"pk": f"PROJECT#{pid}", "sk": f"PROJECT#{pid}"})
        item = resp.get("Item")
        if item and not item.get("is_deleted"):
            if status and item.get("status") != status:
                continue
            results.append({
                "project_id": item.get("project_id"),
                "name": item.get("name"),
                "client_name": item.get("client_name"),
                "status": item.get("status"),
                "progress": item.get("progress"),
                "start_date": item.get("start_date"),
                "end_date": item.get("end_date"),
            })

    return json.dumps(results, ensure_ascii=False)


# ─── get_tasks ────────────────────────────────────────────
class GetTasksInput(BaseModel):
    project_id: Optional[str] = Field(None, description="案件IDで絞り込む場合に指定")
    assignee_id: Optional[str] = Field(None, description="担当者IDで絞り込む場合に指定")
    overdue_only: bool = Field(False, description="期限切れタスクのみ取得する場合は True")


@tool("get_tasks", args_schema=GetTasksInput)
def get_tasks(
    project_id: Optional[str] = None,
    assignee_id: Optional[str] = None,
    overdue_only: bool = False,
    _allowed_project_ids: Optional[list[str]] = None,
) -> str:
    """タスクデータを取得する（Read Only）"""
    table = _get_table()
    now_epoch = int(datetime.now(timezone.utc).timestamp())
    results = []

    if project_id:
        targets = [project_id]
    else:
        targets = (_allowed_project_ids or [])[:10]

    for pid in targets:
        resp = table.query(
            KeyConditionExpression=Key("pk").eq(f"PROJECT#{pid}") & Key("sk").begins_with("TASK#"),
            FilterExpression=Attr("is_deleted").eq(False),
        )
        for item in resp.get("Items", []):
            if assignee_id and item.get("assignee_id") != assignee_id:
                continue
            is_overdue = item.get("due_epoch", 0) < now_epoch and item.get("status") != "done"
            if overdue_only and not is_overdue:
                continue
            results.append({
                "task_id": item.get("task_id"),
                "project_id": item.get("project_id"),
                "title": item.get("title"),
                "status": item.get("status"),
                "priority": item.get("priority"),
                "assignee_id": item.get("assignee_id"),
                "due_date": item.get("due_date"),
                "is_overdue": is_overdue,
            })

    return json.dumps(results, ensure_ascii=False)


# ─── get_documents ────────────────────────────────────────
class GetDocumentsInput(BaseModel):
    project_id: str = Field(..., description="ドキュメントを取得する案件ID")
    doc_type: Optional[str] = Field(None, description="ファイル種別フィルタ (pdf/docx 等)")


@tool("get_documents", args_schema=GetDocumentsInput)
def get_documents(
    project_id: str,
    doc_type: Optional[str] = None,
    _allowed_project_ids: Optional[list[str]] = None,
) -> str:
    """S3に保存されたドキュメントのメタデータと抜粋を取得する（Read Only）"""
    # OWASP LLM04: S3から取得したテキストをそのままシステムプロンプトに挿入しない
    if _allowed_project_ids is not None and project_id not in _allowed_project_ids:
        return json.dumps({"error": "アクセス権限がありません"}, ensure_ascii=False)

    table = _get_table()
    resp = table.query(
        KeyConditionExpression=Key("pk").eq(f"PROJECT#{project_id}") & Key("sk").begins_with("FILE#"),
    )

    files = []
    for item in resp.get("Items", []):
        ct = item.get("content_type", "")
        if doc_type and doc_type not in ct:
            continue
        files.append({
            "file_id": item.get("file_id"),
            "file_name": item.get("file_name"),
            "content_type": ct,
            "size": item.get("size"),
            "uploaded_by": item.get("uploaded_by"),
            "created_at": item.get("created_at"),
            # テキスト抜粋: 実運用では S3 Select や Textract を使う
            "excerpt": f"[ファイル: {item.get('file_name')}]",
        })

    return json.dumps(files, ensure_ascii=False)


# ─── aggregate_metrics ────────────────────────────────────
class AggregateMetricsInput(BaseModel):
    project_id: Optional[str] = Field(None, description="集計対象の案件ID（省略時は全担当案件）")
    period_from: Optional[str] = Field(None, description="集計開始日 YYYY-MM-DD")
    period_to: Optional[str] = Field(None, description="集計終了日 YYYY-MM-DD")


@tool("aggregate_metrics", args_schema=AggregateMetricsInput)
def aggregate_metrics(
    project_id: Optional[str] = None,
    period_from: Optional[str] = None,
    period_to: Optional[str] = None,
    _allowed_project_ids: Optional[list[str]] = None,
) -> str:
    """数値集計・KPI計算を行いBedrockへのトークンを節約する（Read Only）

    DET-001: DynamoDBの生データをそのままBedrockに渡すとトークンが大量消費される。
    事前にPythonで集計・サマリー化してからBedrockに渡すことで入力トークンを大幅削減。
    """
    table = _get_table()
    targets = [project_id] if project_id else (_allowed_project_ids or [])[:10]

    total_tasks = done = overdue = in_progress = 0
    by_assignee: dict[str, dict] = {}
    now_epoch = int(datetime.now(timezone.utc).timestamp())

    for pid in targets:
        resp = table.query(
            KeyConditionExpression=Key("pk").eq(f"PROJECT#{pid}") & Key("sk").begins_with("TASK#"),
            FilterExpression=Attr("is_deleted").eq(False),
        )
        for t in resp.get("Items", []):
            if period_from and t.get("due_date", "") < period_from:
                continue
            if period_to and t.get("due_date", "") > period_to:
                continue
            total_tasks += 1
            st = t.get("status", "")
            aid = t.get("assignee_id", "unknown")
            if st == "done":
                done += 1
            elif st == "in_progress":
                in_progress += 1
            if t.get("due_epoch", 0) < now_epoch and st != "done":
                overdue += 1
            by_assignee.setdefault(aid, {"total": 0, "done": 0, "overdue": 0})
            by_assignee[aid]["total"] += 1
            if st == "done":
                by_assignee[aid]["done"] += 1
            if t.get("due_epoch", 0) < now_epoch and st != "done":
                by_assignee[aid]["overdue"] += 1

    progress_rate = round(done / total_tasks * 100, 1) if total_tasks else 0

    return json.dumps({
        "total_tasks": total_tasks,
        "done": done,
        "in_progress": in_progress,
        "overdue": overdue,
        "progress_rate": progress_rate,
        "by_assignee": by_assignee,
    }, ensure_ascii=False)


# ─── get_user_context ─────────────────────────────────────
class GetUserContextInput(BaseModel):
    user_id: str = Field(..., description="ユーザーID")


@tool("get_user_context", args_schema=GetUserContextInput)
def get_user_context(user_id: str) -> str:
    """ユーザーの権限・担当案件情報を取得する（Read Only）"""
    table = _get_table()

    # ユーザー情報
    user_resp = table.get_item(Key={"pk": f"USER#{user_id}", "sk": f"USER#{user_id}"})
    user = user_resp.get("Item", {})
    role = user.get("role", "member")

    # 担当案件ID一覧（GSI2経由）
    dynamodb = boto3.resource("dynamodb", region_name=_REGION)
    index_resp = dynamodb.Table(_TABLE_NAME).query(
        IndexName="user-entity-index",
        KeyConditionExpression=Key("gsi2pk").eq(f"USER#{user_id}") & Key("sk").begins_with("ASSIGNEE#"),
    )
    assigned_ids = [item.get("project_id") for item in index_resp.get("Items", [])]

    return json.dumps({
        "user_id": user_id,
        "role": role,
        "assigned_project_ids": assigned_ids if role == "member" else None,
        "can_access_all": role in ("admin", "manager"),
    }, ensure_ascii=False)


# ─── save_report ──────────────────────────────────────────
class SaveReportInput(BaseModel):
    title: str = Field(..., description="レポートタイトル")
    content: str = Field(..., description="レポート本文（Markdown）")
    type: str = Field(..., description="レポート種別: project/workload/risk")
    project_id: Optional[str] = Field(None, description="対象案件ID（type=project時）")


@tool("save_report", args_schema=SaveReportInput)
def save_report(
    title: str,
    content: str,
    type: str,
    project_id: Optional[str] = None,
    _user_id: Optional[str] = None,
) -> str:
    """生成したレポートをDynamoDBに保存する（Write: 明示的指示時のみ実行）"""
    table = _get_table()
    report_id = str(uuid4())
    now = datetime.now(timezone.utc).isoformat()

    item = {
        "pk": f"REPORT#{report_id}",
        "sk": f"REPORT#{report_id}",
        "gsi1pk": "REPORT",
        "gsi1sk": now,
        "gsi2pk": f"USER#{_user_id}" if _user_id else "USER#unknown",
        "report_id": report_id,
        "title": title,
        "type": type,
        "content": content[:40000],  # DynamoDB 400KB上限考慮
        "generated_by": _user_id or "unknown",
        "created_at": now,
    }
    if project_id:
        item["project_id"] = project_id

    table.put_item(Item=item)
    return json.dumps({"report_id": report_id, "saved": True}, ensure_ascii=False)


ALL_TOOLS = [get_projects, get_tasks, get_documents, aggregate_metrics, get_user_context, save_report]
