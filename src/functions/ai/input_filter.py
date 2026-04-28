# OWASP LLM01: プロンプトインジェクション対策（DB-001 LLMセキュリティシート ① 対応）
# CLAUDE.md: ユーザー入力は HumanMessage に完全隔離。SystemPrompt と連結禁止

import re

# 既知のプロンプトインジェクションパターン
_INJECTION_PATTERNS = [
    r"ignore\s+(?:previous|all|above|prior)\s+instructions?",
    r"disregard\s+(?:previous|all|above)\s+",
    r"forget\s+(?:everything|all|previous|your\s+instructions?)",
    r"you\s+are\s+now\s+(?:a|an|my)",
    r"new\s+(?:role|persona|instructions?|task)",
    r"act\s+as\s+(?:a|an|if)",
    r"pretend\s+(?:you\s+are|to\s+be)",
    r"system\s*(?:prompt|message|instruction)",
    r"reveal\s+(?:your|the)\s+(?:system|prompt|instruction)",
    r"print\s+(?:your|the)\s+(?:system|prompt)",
    r"show\s+me\s+your\s+(?:system|prompt|instruction)",
    r"私の?システムプロンプトを(?:教えて|見せて|表示)",
    r"指示を?無視",
    r"前の?指示を?忘れ",
]

_COMPILED_PATTERNS = [re.compile(p, re.IGNORECASE) for p in _INJECTION_PATTERNS]

MAX_MESSAGE_LENGTH = 4000  # DET-001 API仕様準拠


def validate_user_input(text: str) -> tuple[bool, str]:
    """
    ユーザー入力を検証する。
    Returns: (is_valid, error_message)
    """
    # 長さチェック
    if len(text) > MAX_MESSAGE_LENGTH:
        return False, f"メッセージが長すぎます（最大{MAX_MESSAGE_LENGTH}文字）"

    # プロンプトインジェクション検出
    for pattern in _COMPILED_PATTERNS:
        if pattern.search(text):
            return False, "不正なリクエストパターンが検出されました"

    return True, ""
