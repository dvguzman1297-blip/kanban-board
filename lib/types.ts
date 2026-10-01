export type Column = { id: string; board_id: string; name: string; order_index: number; wip_limit: number | null };
export type Subtask = { id: string; title: string; done: boolean };
export type Card = {
  id: string; column_id: string; board_id: string; title: string; description: string | null;
  priority: "low" | "medium" | "high" | "urgent"; energy_level: "low" | "medium" | "high";
  due_date: string | null; subtasks: Subtask[]; order_index: number;
  color?: string | null; // palette key; null/undefined = use the column's colour
};

export type Attachment = {
  id: string; card_id: string; board_id: string; name: string; path: string;
  mime_type: string | null; size: number;
  url: string | null; // short-lived signed URL
};
