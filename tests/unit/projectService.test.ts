// CLAUDE.md: ServiceレイヤーはRepositoryをモック化して単体テスト
import { ProjectService } from '../../src/functions/projects/service.js';
import type { IProjectRepository } from '../../src/shared/db/repositories/projectRepository.js';
import type { ITaskRepository } from '../../src/shared/db/repositories/taskRepository.js';
import type { Project } from '../../src/shared/types/index.js';
import { ForbiddenError, NotFoundError, ConflictError } from '../../src/shared/errors/index.js';

// ─── モック ──────────────────────────────────────────────
const makeProject = (overrides: Partial<Project> = {}): Project => ({
  project_id:  'proj-001',
  name:        'テスト案件',
  client_name: 'テスト顧客',
  status:      'active',
  progress:    50,
  start_date:  '2026-01-01',
  end_date:    '2026-12-31',
  owner_id:    'user-001',
  is_deleted:  false,
  created_at:  '2026-01-01T00:00:00Z',
  updated_at:  '2026-01-01T00:00:00Z',
  ...overrides,
});

const mockProjectRepo = (): jest.Mocked<IProjectRepository> => ({
  put:            jest.fn(),
  get:            jest.fn(),
  listAll:        jest.fn(),
  listByAssignee: jest.fn(),
  update:         jest.fn(),
  putAssignee:    jest.fn(),
  deleteAssignee: jest.fn(),
  listAssignees:  jest.fn(),
});

const mockTaskRepo = (): jest.Mocked<ITaskRepository> => ({
  put:                    jest.fn(),
  get:                    jest.fn(),
  getByTaskId:            jest.fn(),
  listByProject:          jest.fn(),
  listByAssignee:         jest.fn(),
  listOverdue:            jest.fn(),
  update:                 jest.fn(),
  logicalDeleteByProject: jest.fn(),
  putComment:             jest.fn(),
  listComments:           jest.fn(),
});

// ─── テスト ───────────────────────────────────────────────
describe('ProjectService', () => {
  let projectRepo: jest.Mocked<IProjectRepository>;
  let taskRepo: jest.Mocked<ITaskRepository>;
  let service: ProjectService;

  beforeEach(() => {
    projectRepo = mockProjectRepo();
    taskRepo = mockTaskRepo();
    service = new ProjectService(projectRepo, taskRepo);
  });

  // ── get ────────────────────────────────────────────────
  describe('get', () => {
    it('Managerは任意の案件を取得できる', async () => {
      const project = makeProject();
      projectRepo.get.mockResolvedValue(project);

      const result = await service.get('proj-001', 'user-001', 'manager');
      expect(result).toEqual(project);
      expect(projectRepo.get).toHaveBeenCalledWith('proj-001');
    });

    it('存在しない案件は NotFoundError', async () => {
      projectRepo.get.mockResolvedValue(null);
      await expect(service.get('proj-xxx', 'user-001', 'manager')).rejects.toThrow(NotFoundError);
    });

    it('論理削除済み案件は NotFoundError', async () => {
      projectRepo.get.mockResolvedValue(makeProject({ is_deleted: true }));
      await expect(service.get('proj-001', 'user-001', 'manager')).rejects.toThrow(NotFoundError);
    });

    it('MemberはアサインされていないプロジェクトにForbiddenError', async () => {
      projectRepo.get.mockResolvedValue(makeProject());
      projectRepo.listByAssignee.mockResolvedValue([]); // 担当なし

      await expect(service.get('proj-001', 'user-001', 'member')).rejects.toThrow(ForbiddenError);
    });

    it('Memberは担当案件を取得できる', async () => {
      const project = makeProject();
      projectRepo.get.mockResolvedValue(project);
      projectRepo.listByAssignee.mockResolvedValue(['proj-001']);

      const result = await service.get('proj-001', 'user-001', 'member');
      expect(result).toEqual(project);
    });
  });

  // ── create ────────────────────────────────────────────
  describe('create', () => {
    it('Memberは案件作成できない', async () => {
      await expect(
        service.create(
          { name: 'X', client_name: 'Y', status: 'active', start_date: '2026-01-01', end_date: '2026-12-31', assignee_ids: ['uid'] },
          'user-001', 'member',
        ),
      ).rejects.toThrow(ForbiddenError);
    });

    it('Managerは案件を作成できる', async () => {
      projectRepo.put.mockResolvedValue(undefined);
      projectRepo.putAssignee.mockResolvedValue(undefined);

      const result = await service.create(
        { name: 'テスト', client_name: '顧客', status: 'planning', start_date: '2026-01-01', end_date: '2026-12-31', assignee_ids: ['uid-1'] },
        'user-001', 'manager',
      );

      expect(result.name).toBe('テスト');
      expect(result.is_deleted).toBe(false);
      expect(projectRepo.put).toHaveBeenCalledTimes(1);
      expect(projectRepo.putAssignee).toHaveBeenCalledTimes(1);
    });
  });

  // ── logicalDelete ──────────────────────────────────────
  describe('logicalDelete', () => {
    it('AdminではないユーザーはForbiddenError', async () => {
      await expect(service.logicalDelete('proj-001', 'manager')).rejects.toThrow(ForbiddenError);
    });

    it('存在しない案件はNotFoundError', async () => {
      projectRepo.get.mockResolvedValue(null);
      await expect(service.logicalDelete('proj-001', 'admin')).rejects.toThrow(NotFoundError);
    });

    it('すでに削除済みはConflictError', async () => {
      projectRepo.get.mockResolvedValue(makeProject({ is_deleted: true }));
      await expect(service.logicalDelete('proj-001', 'admin')).rejects.toThrow(ConflictError);
    });

    it('Adminは案件を論理削除し関連タスクも削除する', async () => {
      projectRepo.get.mockResolvedValue(makeProject());
      projectRepo.update.mockResolvedValue(undefined);
      taskRepo.logicalDeleteByProject.mockResolvedValue(undefined);

      await service.logicalDelete('proj-001', 'admin');

      expect(projectRepo.update).toHaveBeenCalledWith(
        'proj-001',
        expect.objectContaining({ is_deleted: true }),
      );
      expect(taskRepo.logicalDeleteByProject).toHaveBeenCalledWith(
        'proj-001',
        expect.any(String),
        expect.any(Number),
      );
    });
  });
});
