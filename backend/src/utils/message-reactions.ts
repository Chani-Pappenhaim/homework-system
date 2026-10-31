// The emoji a message entry can be reacted with. Mirrored by the frontend's
// lib/reactions.ts, which renders the picker from the same list.
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🙏', '✅'] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export function isAllowedReaction(emoji: unknown): emoji is ReactionEmoji {
  return typeof emoji === 'string' && (REACTION_EMOJIS as readonly string[]).includes(emoji);
}
