export type Dict = Record<string, string>;
const en: Dict = {
  comments: 'Comments', sortNew: 'Newest', sortHot: 'Top', nickname: 'Nickname', email: 'Email (optional, never shown)',
  placeholder: 'Write a comment…', notify: 'Email me when someone replies', submit: 'Post', posting: 'Posting…',
  reply: 'Reply', cancel: 'Cancel', replyTo: 'Replying to', more: 'Load more', empty: 'No comments yet. Be the first!',
  loading: 'Loading comments…', image: 'Add image', removeImage: 'Remove image', like: 'Like', dislike: 'Dislike',
  errLoad: 'Failed to load comments.', errNick: 'Please enter a nickname.', errText: 'Please write something.',
  errGeneric: 'Something went wrong, please try again.', errRate: 'Too many requests, please slow down.',
  errCaptcha: 'Verification failed, please try again.', errImage: 'Could not process this image.', errBanned: 'You are not allowed to comment.',
  pending: 'Awaiting review', justNow: 'just now', retry: 'Retry', imgAlt: 'Image attached by',
};
const zh: Dict = {
  comments: '评论', sortNew: '最新', sortHot: '最热', nickname: '昵称', email: '邮箱（可选，不会公开）',
  placeholder: '写下你的评论…', notify: '有人回复时邮件通知我', submit: '发表', posting: '发表中…',
  reply: '回复', cancel: '取消', replyTo: '回复', more: '加载更多', empty: '还没有评论，来抢沙发吧！',
  loading: '评论加载中…', image: '添加图片', removeImage: '移除图片', like: '赞', dislike: '踩',
  errLoad: '评论加载失败。', errNick: '请填写昵称。', errText: '请输入评论内容。',
  errGeneric: '出错了，请稍后重试。', errRate: '操作太频繁，请稍后再试。',
  errCaptcha: '人机验证失败，请重试。', errImage: '图片处理失败。', errBanned: '你已被禁止发表评论。',
  pending: '审核中', justNow: '刚刚', retry: '重试', imgAlt: '图片，作者：',
};
export function dictFor(lang: string): { dict: Dict; locale: string } {
  const l = (lang === 'auto' || !lang ? navigator.language : lang).toLowerCase();
  return l.startsWith('zh') ? { dict: zh, locale: 'zh-CN' } : { dict: en, locale: 'en' };
}
