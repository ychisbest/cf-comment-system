export const now = () => Math.floor(Date.now() / 1000);

/** 把评论 / 页面计数同步为实际可见数量。 */
export async function recountPages(db: D1Database, pageIds: number[]): Promise<void> {
  const ids = [...new Set(pageIds)];
  if (!ids.length) return;
  await db.batch(
    ids.map((id) =>
      db
        .prepare("UPDATE pages SET comment_count = (SELECT COUNT(*) FROM comments WHERE page_id = ?1 AND status = 'visible') WHERE id = ?1")
        .bind(id),
    ),
  );
}
