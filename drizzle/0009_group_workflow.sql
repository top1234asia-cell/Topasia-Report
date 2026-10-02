ALTER TABLE directory_options ADD COLUMN creation_type TEXT NOT NULL DEFAULT '常规建单';
ALTER TABLE directory_options ADD COLUMN collaborator TEXT NOT NULL DEFAULT '';
