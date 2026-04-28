# OWASP LLM02: 機密情報の開示防止（DB-001 LLMセキュリティシート ② 対応）
# Bedrockの出力をフロントに渡す前にPIIをマスクする

import re

_EMAIL_RE = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')
_PHONE_RE = re.compile(r'(?:\+81|0)\d{1,4}[-\s]?\d{2,4}[-\s]?\d{3,4}')
# UUIDそのままの漏洩を防ぐ（内部IDが丸出しになるのを避ける）
_UUID_RE = re.compile(r'\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b', re.IGNORECASE)

# DynamoDB の生属性キーが出力に含まれた場合も除去
_DYNAMO_KEYS = re.compile(r'\b(?:pk|sk|gsi1pk|gsi1sk|gsi2pk|ttl)\b\s*[:=]\s*\S+')


def sanitize_llm_output(text: str) -> str:
    """LLM出力からPII・内部情報をマスクして返す"""
    text = _EMAIL_RE.sub('[メールアドレス]', text)
    text = _PHONE_RE.sub('[電話番号]', text)
    text = _UUID_RE.sub('[ID]', text)
    text = _DYNAMO_KEYS.sub('[内部キー]', text)
    return text
