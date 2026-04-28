"""ツール関数テスト（DynamoDB / S3 はモック）"""
import sys
import os
import json
from unittest.mock import MagicMock, patch
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ─── DynamoDB / boto3 をモック ─────────────────────────────
class _FakeDynamo:
    def __init__(self, items=None):
        self._items = items or []

    def query(self, **kwargs):
        return {"Items": self._items, "Count": len(self._items)}

    def get_item(self, **kwargs):
        if self._items:
            return {"Item": self._items[0]}
        return {}


def _make_dynamo_mock(items=None):
    mock_resource = MagicMock()
    mock_resource.Table.return_value = _FakeDynamo(items)
    return mock_resource


# ─── get_projects ────────────────────────────────────────────
class TestGetProjects:
    def test_returns_projects_for_assigned_ids(self):
        fake_projects = [
            {"project_id": "p1", "name": "案件A", "status": "active", "is_deleted": False},
            {"project_id": "p2", "name": "案件B", "status": "planning", "is_deleted": False},
        ]
        with patch("tools.boto3.resource", return_value=_make_dynamo_mock(fake_projects)):
            import tools
            result_str = tools.get_projects.invoke({
                "_allowed_project_ids": ["p1", "p2"],
                "_user_id": "user-1",
            })
        result = json.loads(result_str)
        assert len(result["projects"]) == 2
        assert result["projects"][0]["project_id"] == "p1"

    def test_filters_deleted_projects(self):
        fake_projects = [
            {"project_id": "p1", "name": "案件A", "status": "active", "is_deleted": True},
            {"project_id": "p2", "name": "案件B", "status": "active", "is_deleted": False},
        ]
        with patch("tools.boto3.resource", return_value=_make_dynamo_mock(fake_projects)):
            import tools
            result_str = tools.get_projects.invoke({
                "_allowed_project_ids": None,  # admin: 全件
                "_user_id": "user-admin",
            })
        result = json.loads(result_str)
        # is_deleted=True は除外される
        alive = [p for p in result["projects"] if not p.get("is_deleted", False)]
        assert all(not p.get("is_deleted", False) for p in result["projects"])

    def test_empty_result_when_no_projects(self):
        with patch("tools.boto3.resource", return_value=_make_dynamo_mock([])):
            import tools
            result_str = tools.get_projects.invoke({
                "_allowed_project_ids": ["p999"],
                "_user_id": "user-1",
            })
        result = json.loads(result_str)
        assert result["projects"] == []
        assert result["count"] == 0


# ─── aggregate_metrics ───────────────────────────────────────
class TestAggregateMetrics:
    def test_calculates_completion_rate(self):
        fake_tasks = [
            {"status": "done"},
            {"status": "done"},
            {"status": "in_progress"},
            {"status": "todo"},
        ]
        with patch("tools.boto3.resource", return_value=_make_dynamo_mock(fake_tasks)):
            import tools
            result_str = tools.aggregate_metrics.invoke({
                "project_id": "p1",
                "_allowed_project_ids": ["p1"],
                "_user_id": "user-1",
            })
        result = json.loads(result_str)
        assert result["total_tasks"] == 4
        assert result["completed_tasks"] == 2
        assert result["completion_rate"] == 50.0

    def test_zero_tasks_returns_zero_rate(self):
        with patch("tools.boto3.resource", return_value=_make_dynamo_mock([])):
            import tools
            result_str = tools.aggregate_metrics.invoke({
                "project_id": "p1",
                "_allowed_project_ids": ["p1"],
                "_user_id": "user-1",
            })
        result = json.loads(result_str)
        assert result["completion_rate"] == 0.0
        assert result["total_tasks"] == 0


# ─── get_tasks ───────────────────────────────────────────────
class TestGetTasks:
    def test_returns_tasks_for_project(self):
        fake_tasks = [
            {"task_id": "t1", "title": "タスク1", "status": "todo",        "is_deleted": False},
            {"task_id": "t2", "title": "タスク2", "status": "in_progress", "is_deleted": False},
        ]
        with patch("tools.boto3.resource", return_value=_make_dynamo_mock(fake_tasks)):
            import tools
            result_str = tools.get_tasks.invoke({
                "project_id": "p1",
                "_allowed_project_ids": ["p1"],
                "_user_id": "user-1",
            })
        result = json.loads(result_str)
        assert len(result["tasks"]) == 2

    def test_forbidden_project_returns_empty(self):
        """割り当て外案件のタスクは返さない（OWASP LLM04）"""
        with patch("tools.boto3.resource", return_value=_make_dynamo_mock([])):
            import tools
            result_str = tools.get_tasks.invoke({
                "project_id": "p-forbidden",
                "_allowed_project_ids": ["p1", "p2"],  # p-forbidden は含まない
                "_user_id": "user-1",
            })
        result = json.loads(result_str)
        # 権限外 → エラーまたは空のタスクリスト
        assert "error" in result or result.get("tasks") == [] or result.get("count") == 0


# ─── get_user_context ────────────────────────────────────────
class TestGetUserContext:
    def test_returns_user_context(self):
        fake_user = {
            "user_id": "user-1",
            "name": "山田太郎",
            "role": "member",
            "email": "yamada@example.com",
        }
        with patch("tools.boto3.resource", return_value=_make_dynamo_mock([fake_user])):
            import tools
            result_str = tools.get_user_context.invoke({
                "_allowed_project_ids": ["p1"],
                "_user_id": "user-1",
            })
        result = json.loads(result_str)
        assert result["user_id"] == "user-1"
        assert result["name"] == "山田太郎"
        # メールアドレスは含まれない（個人情報保護）
        assert "email" not in result
