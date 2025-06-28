const moment = require('moment');

async function calculateSalaryForMonth(conn, employeeId, month) {
  const [[emp]] = await conn.query('SELECT salary, salary_type, paid_sunday_allowance FROM employees WHERE id = ?', [employeeId]);
  if (!emp) return;
  const [attendance] = await conn.query(
    'SELECT date, status FROM employee_attendance WHERE employee_id = ? AND DATE_FORMAT(date, "%Y-%m") = ?',
    [employeeId, month]
  );
  const [sandwichRows] = await conn.query(
    'SELECT date FROM sandwich_dates WHERE DATE_FORMAT(date, "%Y-%m") = ?',
    [month]
  );
  const daysInMonth = moment(month + '-01').daysInMonth();
  const dailyRate = parseFloat(emp.salary) / daysInMonth;
  const sandwichDates = sandwichRows.map(r => moment(r.date).format('YYYY-MM-DD'));
  const attMap = {};
  attendance.forEach(a => {
    attMap[moment(a.date).format('YYYY-MM-DD')] = a.status;
  });

  let absent = 0;
  let extraPay = 0;
  let paidUsed = 0;

  attendance.forEach(a => {
    const dateStr = moment(a.date).format('YYYY-MM-DD');
    const status = a.status;
    const isSun = moment(a.date).day() === 0;
    const isSandwich = sandwichDates.includes(dateStr);

    if (isSun) {
      const satStatus = attMap[moment(a.date).subtract(1, 'day').format('YYYY-MM-DD')];
      const monStatus = attMap[moment(a.date).add(1, 'day').format('YYYY-MM-DD')];
      const adjAbsent = (satStatus === 'absent' || satStatus === 'one punch only') ||
                        (monStatus === 'absent' || monStatus === 'one punch only');
      if (adjAbsent) {
        absent++;
        return;
      }
    }

    if (isSandwich) {
      const prevStatus = attMap[moment(a.date).subtract(1, 'day').format('YYYY-MM-DD')];
      const nextStatus = attMap[moment(a.date).add(1, 'day').format('YYYY-MM-DD')];
      const adjAbsent = (prevStatus === 'absent' || prevStatus === 'one punch only') ||
                        (nextStatus === 'absent' || nextStatus === 'one punch only');
      if (adjAbsent) {
        absent++;
        return;
      }
    }

    if (isSun) {
      if (status === 'present') {
        if (parseFloat(emp.salary) < 13500) {
          extraPay += dailyRate;
        } else if (paidUsed < (emp.paid_sunday_allowance || 0)) {
          extraPay += dailyRate;
          paidUsed++;
        }
      }
    } else {
      if (status === 'absent' || status === 'one punch only') absent++;
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
