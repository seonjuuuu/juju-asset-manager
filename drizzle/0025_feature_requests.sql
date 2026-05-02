CREATE TABLE IF NOT EXISTS "feature_requests" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL DEFAULT 0,
  "author_name" varchar(120),
  "title" varchar(200) NOT NULL,
  "content" text NOT NULL,
  "status" varchar(30) NOT NULL DEFAULT '요청',
  "is_done" boolean NOT NULL DEFAULT false,
  "checked_by_user_id" integer,
  "checked_at" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
