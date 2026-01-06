CREATE DATABASE IF NOT EXISTS converter
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;
USE converter;

CREATE TABLE users (
  id            INT          PRIMARY KEY AUTO_INCREMENT,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE conversions (
  id             INT           PRIMARY KEY AUTO_INCREMENT,
  user_id        INT           NOT NULL,
  input_format   VARCHAR(20),
  output_format  VARCHAR(20),
  settings       TEXT,
  input_text     MEDIUMTEXT,
  output_text    MEDIUMTEXT,
  created_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
