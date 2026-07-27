-- Development seed data
INSERT INTO users (id, username, email, password_hash, role, provider, is_active)
VALUES 
  ('550e8400-e29b-41d4-a716-446655440000', 'testuser', 'test@example.com', '$2a$10$slYQmyNdGzin7olVN3/p2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUm', 'CUSTOMER', 'local', true),
  ('550e8400-e29b-41d4-a716-446655440001', 'admin', 'admin@example.com', '$2a$10$slYQmyNdGzin7olVN3/p2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUm', 'ADMIN', 'local', true);
