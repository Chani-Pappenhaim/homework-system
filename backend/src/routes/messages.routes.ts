import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import * as messagesController from '../controllers/messages.controller';

const router = Router();
router.use(verifyAccessTokenMiddleware);

router.post('/', requireRole('STUDENT'), messagesController.sendMessage);
router.get('/', requireRole('ADMIN'), messagesController.getMessages);
router.get('/mine', requireRole('STUDENT'), messagesController.getMyMessages);
router.get('/unread-count', requireRole('ADMIN'), messagesController.getUnreadCount);
router.get('/unread-replies-count', requireRole('STUDENT'), messagesController.getUnreadReplyCount);
router.patch('/:id/read', requireRole('ADMIN'), messagesController.markRead);
router.patch('/:id/reply-seen', requireRole('STUDENT'), messagesController.markReplySeen);
router.post('/:id/reply', requireRole('ADMIN'), messagesController.replyMessage);
router.delete('/:id/reply', requireRole('ADMIN'), messagesController.deleteReply);
router.delete('/:id/mine', requireRole('STUDENT'), messagesController.deleteMyMessage);
router.delete('/:id', requireRole('ADMIN'), messagesController.deleteMessage);

export default router;
