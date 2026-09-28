import * as assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findKnowledgeRoot, listKnowledgeArticles } from '../features/knowledge-history/gitKnowledgeCatalog';

suite('Git knowledge catalog', () => {
	test('searches Markdown content under the selected repository', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'vc-ve-knowledge-'));
		const articles = path.join(root, 'docs', 'knowledge', 'tasks');
		mkdirSync(articles, { recursive: true });
		writeFileSync(path.join(articles, '88405.md'), '# Диалог проверки\n\nПравило о пакетах и методах.');
		try {
			assert.equal(await findKnowledgeRoot(root), root);
			assert.equal(await findKnowledgeRoot(path.join(root, 'missing')), undefined);
			const found = await listKnowledgeArticles(root, 'пакетах');
			assert.equal(found.length, 1);
			assert.equal(found[0].title, 'Диалог проверки');
			assert.equal(found[0].id, 'tasks/88405.md');
			assert.equal((await listKnowledgeArticles(root, 'несуществующий')).length, 0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
