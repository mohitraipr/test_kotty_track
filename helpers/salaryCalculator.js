const moment = require('moment');

async function calculateSalaryForMonth(conn, employeeId, month) {
  const [[emp]] = await conn.query('SELECT salary, salary_type, paid_sunday_allowance FROM employees WHERE id = ?', [employeeId]);
  if (!emp) return;
  const [attendance] = await conn.query(
    'SELECT date, status FROM employee_attendance WHERE employee_id = ? AND DATE_FORMAT(date, "%Y-%m") = ?',
    [employeeId, month]
  );
  const daysInMonth = moment(month + '-01').daysInMonth();
  const dailyRate = parseFloat(emp.salary) / daysInMonth;
  let absent = 0;
  let extraPay = 0;
  let paidUsed = 0;
  attendance.forEach(a => {
    const isSun = moment(a.date).day() === 0;
    if (isSun) {
      if (a.status === 'present') {
        if (parseFloat(emp.salary) < 13500) {
          extraPay += dailyRate;
        } else if (paidUsed < (emp.paid_sunday_allowance || 0)) {
          extraPay += dailyRate;
          paidUsed++;
        }
      }
    } else {
      if (a.status === 'absent' || a.status === 'one punch only') absent++;
    }
  });

  const [nightRows] = await conn.query(
    'SELECT COALESCE(SUM(nights),0) AS total_nights FROM employee_nights WHERE employee_id = ? AND month = ?',
    [employeeId, month]
  );
  const nightPay = (parseFloat(nightRows[0].total_nights) || 0) * dailyRate;
  extraPay += nightPay;
  const gross = parseFloat(emp.salary) + extraPay;
  const deduction = absent * dailyRate;
  const net = gross - deduction;
  await conn.query(
    `INSERT INTO employee_salaries (employee_id, month, gross, deduction, net, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE gross=VALUES(gross), deduction=VALUES(deduction), net=VALUES(net)`,
    [employeeId, month, gross, deduction, net]
  );
}

module.exports = { calculateSalaryForMonth };
