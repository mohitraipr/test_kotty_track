const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { isAuthenticated, isSupervisor } = require('../middlewares/auth');

router.get('/employees', isAuthenticated, isSupervisor, async (req, res) => {
  try {
    const [employees] = await pool.query(
      `SELECT id, punching_id, name, salary, salary_type, working_hours
         FROM employees WHERE created_by=? ORDER BY id`,
      [req.session.user.id]
    );
    res.render('supervisorEmployees', { user: req.session.user, employees });
  } catch (err) {
    console.error('Error fetching supervisor employees:', err);
    res.render('supervisorEmployees', { user: req.session.user, employees: [] });
  }
});

router.post('/employees', isAuthenticated, isSupervisor, async (req, res) => {
  const { punching_id, name, salary, salary_type, working_hours } = req.body;
  if (!punching_id || !name || !salary || !salary_type || !working_hours) {
    req.flash('error', 'All fields are required');
    return res.redirect('/supervisor/employees');
  }
  try {
    await pool.query(
      `INSERT INTO employees (punching_id, name, salary, salary_type, working_hours, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [punching_id, name, salary, salary_type, working_hours, req.session.user.id]
    );
    req.flash('success', 'Employee created');
  } catch (err) {
    console.error('Error creating employee:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      req.flash('error', 'Punching ID already exists for this supervisor');
    } else {
      req.flash('error', 'Could not create employee');
    }
  }
  res.redirect('/supervisor/employees');
});

module.exports = router;
