"""OWASP LLM02: 機密情報マスキングテスト"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from output_sanitizer import sanitize_llm_output


class TestSanitizeLlmOutput:
    # ─── メールアドレスマスキング ────────────────────────────
    def test_email_masked(self):
        result = sanitize_llm_output("担当者: yamada@example.com です")
        assert "yamada@example.com" not in result
        assert "[REDACTED]" in result

    def test_multiple_emails_masked(self):
        result = sanitize_llm_output("a@a.com と b@b.co.jp に連絡してください")
        assert "a@a.com" not in result
        assert "b@b.co.jp" not in result

    # ─── 電話番号マスキング ────────────────────────────────
    def test_phone_number_masked(self):
        result = sanitize_llm_output("電話番号は090-1234-5678です")
        assert "090-1234-5678" not in result

    def test_phone_without_hyphen_masked(self):
        result = sanitize_llm_output("連絡先: 03-1234-5678")
        assert "03-1234-5678" not in result

    # ─── DynamoDBキーパターンマスキング ──────────────────────
    def test_user_pk_masked(self):
        result = sanitize_llm_output("USER#abc123 というキーのアイテムです")
        assert "USER#abc123" not in result

    def test_project_pk_masked(self):
        result = sanitize_llm_output("PROJECT#xyz のデータを取得しました")
        assert "PROJECT#xyz" not in result

    # ─── 正常なコンテンツは変更しない ─────────────────────────
    def test_normal_text_unchanged(self):
        text = "今月の案件は3件進行中です。タスク完了率は75%です。"
        result = sanitize_llm_output(text)
        assert result == text

    def test_markdown_preserved(self):
        text = "## 週次レポート\n\n- 案件A: 進行中\n- 案件B: 完了"
        result = sanitize_llm_output(text)
        assert "## 週次レポート" in result
        assert "- 案件A" in result

    def test_numbers_preserved(self):
        text = "売上: ¥1,234,567 / 予算消化率: 68%"
        result = sanitize_llm_output(text)
        assert "¥1,234,567" in result
        assert "68%" in result

    def test_empty_string(self):
        assert sanitize_llm_output("") == ""

    # ─── UUID マスキング ──────────────────────────────────────
    def test_uuid_masked(self):
        result = sanitize_llm_output("ID: 550e8400-e29b-41d4-a716-446655440000")
        assert "550e8400-e29b-41d4-a716-446655440000" not in result

    def test_uuid_in_context_masked(self):
        result = sanitize_llm_output("user_id=f47ac10b-58cc-4372-a567-0e02b2c3d479 が操作しました")
        assert "f47ac10b-58cc-4372-a567-0e02b2c3d479" not in result
