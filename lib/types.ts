export type Column = { id: string; board_id: string; name: string; order_index: number; wip_limit: number | null };
export type Subtask = { id: string; title: string; done: boolean };
export type Card = {
  id: string; column_id: string; board_id: string; title: string; description: string | null;
  priority: "low" | "medium" | "high" | "urgent"; energy_level: "low" | "medium" | "high";
  due_date: string | null; start_date?: string | null; created_at?: string; subtasks: Subtask[]; order_index: number;
  color?: string | null; // palette key; null/undefined = use the column's colour
  completed_at?: string | null; // set when the card enters the Done column
  user_id?: string; // creator
  assignee_id?: string | null; // board member the card is assigned to
  archived_at?: string | null; // set when archived; hidden from the board unless "Show archived" is on
};

export type Attachment = {
  id: string; card_id: string; board_id: string; name: string; path: string;
  mime_type: string | null; size: number;
  url: string | null; // short-lived signed URL
};

export type CardComment = {
  id: string; card_id: string; user_id: string; content: string; created_at: string; updated_at: string;
  author: { id: string; first_name: string | null; full_name: string | null };
  relativeLabel: string;
};

export type Member = {
  id: string; first_name: string | null; full_name: string | null; display_name: string | null; avatar_url: string | null;
};

export type Tag = { id: string; board_id: string; name: string; color: string };
export const REACTION_EMOJIS = ["👍", "🚀", "🎉", "❤️", "👀"] as const;
export type ReactionSummary = { emoji: string; count: number; mine: boolean };
export type CardEventItem = {
  id: string; kind: string; text: string; createdAt: string; relativeLabel: string;
  actor: { name: string; avatarUrl: string | null };
};

export type CardTemplate = {
  id: string; board_id: string; name: string; title: string; description: string | null;
  priority: Card["priority"]; energy_level: Card["energy_level"]; subtasks: Subtask[]; builtin?: boolean;
};
