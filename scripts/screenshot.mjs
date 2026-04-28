// DevFlow AI — 全画面スクリーンショット自動生成
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT_DIR = './docs/screenshots';
mkdirSync(OUT_DIR, { recursive: true });

const BASE = 'http://localhost:5173';

async function injectDemoUser(page) {
  // React Router の history を使って画面遷移
  await page.evaluate(() => {
    window.__DEMO__ = true;
  });
}

async function goto(page, path) {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await page.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page    = await context.newPage();

  // ① ログイン画面（未認証状態で表示）
  await page.goto(`${BASE}/login`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT_DIR}/01_login.png`, fullPage: false });
  console.log('✅ 01_login.png');

  // デモユーザー注入（AuthContext を一時的に上書き）
  await page.addInitScript(() => {
    // localStorage に demo フラグをセット（後で読み取る）
    // ここでは React fiber 経由で state を直接書き換える方法を使用
  });

  // AuthContext.tsx のデモモードを使うため devServer 側を書き換え済みの前提で
  // /login にアクセスして自動リダイレクト先を撮影
  // ※ デモモード有効時は / が /dashboard にリダイレクト

  await page.goto(`${BASE}/`);
  await page.waitForTimeout(800);

  // ② ダッシュボード
  await goto(page, '/');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT_DIR}/02_dashboard.png` });
  console.log('✅ 02_dashboard.png');

  // ③ 案件一覧
  await goto(page, '/projects');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT_DIR}/03_projects.png` });
  console.log('✅ 03_projects.png');

  // ④ 案件作成モーダル
  await page.click('button.bg-blue-600');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT_DIR}/04_projects_create_modal.png` });
  console.log('✅ 04_projects_create_modal.png');

  // ⑤ タスク一覧
  await goto(page, '/tasks');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT_DIR}/05_tasks.png` });
  console.log('✅ 05_tasks.png');

  // ⑥ タスク作成モーダル
  await page.click('button.bg-blue-600');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT_DIR}/06_tasks_create_modal.png` });
  console.log('✅ 06_tasks_create_modal.png');

  // ⑦ AIチャット
  await goto(page, '/chat');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT_DIR}/07_chat.png` });
  console.log('✅ 07_chat.png');

  // ⑧ レポート
  await goto(page, '/reports');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT_DIR}/08_reports.png` });
  console.log('✅ 08_reports.png');

  // ⑨ メンバー管理
  await goto(page, '/members');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT_DIR}/09_members.png` });
  console.log('✅ 09_members.png');

  // ⑩ メンバー招待モーダル
  await page.click('button.bg-blue-600');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT_DIR}/10_members_invite_modal.png` });
  console.log('✅ 10_members_invite_modal.png');

  // ⑪ システム設定
  await goto(page, '/settings');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT_DIR}/11_settings.png` });
  console.log('✅ 11_settings.png');

  await browser.close();
  console.log(`\n🎉 完了！ ${OUT_DIR}/ に保存しました`);
})();
