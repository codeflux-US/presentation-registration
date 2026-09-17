CREATE DATABASE IF NOT EXISTS student_presentation_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE student_presentation_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('student', 'admin') NOT NULL DEFAULT 'student',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_email (email),
  INDEX idx_users_role (role)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS presentations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  registration_id VARCHAR(30) NOT NULL UNIQUE,
  topic VARCHAR(255) NOT NULL,
  subject VARCHAR(150) NOT NULL,
  section ENUM('A', 'B', 'C') NOT NULL,
  team_type ENUM('Individual', 'Team of 2', 'Team of 3', 'Team of 4', 'Team of 5') NOT NULL,
  presentation_date DATE NOT NULL,
  presentation_time TIME NOT NULL,
  status ENUM('Registered', 'Pending', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_presentations_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  INDEX idx_presentations_user (user_id),
  INDEX idx_presentations_section (section),
  INDEX idx_presentations_status (status),
  INDEX idx_presentations_date (presentation_date),
  INDEX idx_presentations_regid (registration_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS team_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  presentation_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  roll_number VARCHAR(50) NOT NULL,
  email VARCHAR(150) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  CONSTRAINT fk_team_members_presentation
    FOREIGN KEY (presentation_id) REFERENCES presentations(id)
    ON DELETE CASCADE,
  INDEX idx_team_members_presentation (presentation_id),
  INDEX idx_team_members_roll (roll_number)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS registration_sequence (
  id INT PRIMARY KEY DEFAULT 1,
  sequence_value INT NOT NULL DEFAULT 0
) ENGINE=InnoDB;

INSERT INTO registration_sequence (id, sequence_value)
VALUES (1, 0)
ON DUPLICATE KEY UPDATE id = id;