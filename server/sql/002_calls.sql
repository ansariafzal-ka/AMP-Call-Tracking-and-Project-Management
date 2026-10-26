CREATE TABLE IF NOT EXISTS calls (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  contact_number VARCHAR(20) NOT NULL,
  duration_seconds INT NOT NULL,
  status ENUM('answered','not_answered') NOT NULL,
  purpose VARCHAR(255) NULL,
  outcome ENUM('interested','not_interested','unanswered','follow_up_required') NULL,
  called_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_called_contact (user_id, called_at, contact_number),
  INDEX idx_user_called (user_id, called_at),
  CONSTRAINT fk_calls_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
