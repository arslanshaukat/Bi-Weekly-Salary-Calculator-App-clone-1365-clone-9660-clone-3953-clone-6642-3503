/* # Create Holidays Table
1. New Tables
  - `holidays_1773420000000`
    - `id` (uuid, primary key)
    - `name` (text)
    - `date` (date, unique)
    - `type` (text: 'regular', 'special')
    - `created_at` (timestamp)
2. Security
  - Enable RLS
  - Add policy for public access (consistent with project settings)
*/

CREATE TABLE IF NOT EXISTS holidays_1773420000000 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  date date UNIQUE NOT NULL,
  type text NOT NULL CHECK (type IN ('regular', 'special')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE holidays_1773420000000 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access for holidays" ON holidays_1773420000000 FOR ALL TO public USING (true) WITH CHECK (true);

-- Seed some initial 2026 holidays from your previous list
INSERT INTO holidays_1773420000000 (name, date, type) VALUES
('New Year''s Day', '2026-01-01', 'regular'),
('Maundy Thursday', '2026-04-02', 'regular'),
('Good Friday', '2026-04-03', 'regular'),
('Labor Day', '2026-05-01', 'regular'),
('Independence Day', '2026-06-12', 'regular'),
('Christmas Day', '2026-12-25', 'regular'),
('Chinese New Year', '2026-02-17', 'special'),
('EDSA People Power', '2026-02-25', 'special'),
('Black Saturday', '2026-04-04', 'special'),
('Ninoy Aquino Day', '2026-08-21', 'special')
ON CONFLICT (date) DO NOTHING;