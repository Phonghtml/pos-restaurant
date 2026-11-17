// ໃຊ້ຕັ້ງ/ປ່ຽນລະຫັດຜ່ານພະນັກງານ ຈາກເຄື່ອງຂອງຮ້ານເອງ (ບໍ່ commit ລະຫັດຜ່ານ)
// ຕົວຢ່າງ: npx tsx src/scripts/set-staff-password.ts admin "ລະຫັດຜ່ານ"
import { pool } from "../db";
import { hashPassword } from "../auth";

async function main() {
  const [username, password] = process.argv.slice(2);
  if (!username || !password || password.length < 8) {
    console.error("usage: set-staff-password <username> <password (>= 8 chars)>");
    process.exit(1);
  }
  const r = await pool.query(`UPDATE staff SET password_hash = $2 WHERE username = $1`, [username, hashPassword(password)]);
  console.log(r.rowCount ? `updated ${username}` : `no staff named ${username}`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
