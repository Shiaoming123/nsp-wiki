// Only fields already shown on public Wiki pages are returned; liker identities stay private.
export async function publicActivity(db) {
  const comments=await db.prepare(`SELECT 'item' AS kind,c.item AS target,NULL AS label,c.nickname,c.body,c.created FROM item_comments c
    UNION ALL SELECT 'affix',c.affix,NULL,c.nickname,c.body,c.created FROM affix_comments c
    UNION ALL SELECT CASE WHEN p.kind='workshop' THEN 'workshop-post' ELSE 'post' END,c.post,p.title,c.nickname,c.body,c.created FROM comments c JOIN posts p ON p.id=c.post
    UNION ALL SELECT 'feedback',c.feedback,f.title,c.nickname,c.body,c.created FROM wiki_feedback_comments c JOIN wiki_feedback f ON f.id=c.feedback
    ORDER BY created DESC LIMIT 10`).all();
  const likes=await db.prepare(`SELECT 'item' AS kind,item AS target,NULL AS label,created FROM item_likes WHERE created IS NOT NULL
    UNION ALL SELECT 'affix',affix,NULL,created FROM affix_likes WHERE created IS NOT NULL
    UNION ALL SELECT CASE WHEN p.kind='workshop' THEN 'workshop-post' ELSE 'post' END,l.post,p.title,l.created FROM likes l JOIN posts p ON p.id=l.post WHERE l.created IS NOT NULL
    UNION ALL SELECT 'feedback',l.feedback,f.title,l.created FROM wiki_feedback_likes l JOIN wiki_feedback f ON f.id=l.feedback WHERE l.created IS NOT NULL
    UNION ALL SELECT 'item-comment',c.item,NULL,l.created FROM item_comment_likes l JOIN item_comments c ON c.id=l.comment WHERE l.created IS NOT NULL
    UNION ALL SELECT 'affix-comment',c.affix,NULL,l.created FROM affix_comment_likes l JOIN affix_comments c ON c.id=l.comment WHERE l.created IS NOT NULL
    ORDER BY created DESC LIMIT 10`).all();
  return {comments:comments.results,likes:likes.results};
}
