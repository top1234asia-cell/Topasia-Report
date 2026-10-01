import { sqliteTable, integer, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const deliveries = sqliteTable("deliveries", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const directoryOptions = sqliteTable("directory_options", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  customer: text("customer"),
  currency: text("currency"),
  settlement: text("settlement"),
  emails: text("emails"),
  createdAt: integer("created_at").notNull(),
}, table => [uniqueIndex("idx_directory_options_kind_name").on(table.kind, table.name)]);

export const todoItems = sqliteTable("todo_items", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  groupNo: text("group_no").notNull(),
  matter: text("matter").notNull(),
  urgent: integer("urgent").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  createdBy: text("created_by").notNull(),
  completedAt: integer("completed_at"),
  completedBy: text("completed_by"),
});
