const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { isAuthenticated, isSupervisor } = require('../middlewares/auth');

// Show employee dashboard for a supervisor
router.get('/employees', isAuthenticated, isSupervisor, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [deptRows] = await pool.query(
      `SELECT d.name FROM departments d
       JOIN department_supervisors ds ON ds.department_id = d.id
       WHERE ds.user_id = ? LIMIT 1`,
      [userId]
    );
    const department = deptRows.length ? deptRows[0].name : 'N/A';

    const [employees] = await pool.query(
      'SELECT * FROM employees WHERE supervisor_id = ?',
      [userId]
    );

    res.render('supervisorEmployees', {
      user: req.session.user,
      department,
      employees
    });
  } catch (err) {
    console.error('Error loading employees:', err);
    req.flash('error', 'Failed to load employees');
    res.redirect('/dashboard');
  }
});

// Create a new employee for the logged in supervisor
router.post('/employees', isAuthenticated, isSupervisor, async (req, res) => {
  const { punching_id, name, phone_number, salary, salary_type, date_of_joining } = req.body;
  try {
    await pool.query(
      `INSERT INTO employees
        (supervisor_id, punching_id, name, phone_number, salary, salary_type, date_of_joining, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [req.session.user.id, punching_id, name, phone_number, salary, salary_type, date_of_joining]
    );
    req.flash('success', 'Employee created');
    res.redirect('/supervisor/employees');
  } catch (err) {
    console.error('Error creating employee:', err);
    req.flash('error', 'Failed to create employee');
    res.redirect('/supervisor/employees');
  }
});

// Toggle employee active status
router.post('/employees/:id/toggle', isAuthenticated, isSupervisor, async (req, res) => {
  const id = req.params.id;
  try {
    await pool.query(
      `UPDATE employees
          SET is_active = NOT is_active
        WHERE id = ? AND supervisor_id = ?`,
      [id, req.session.user.id]
    );
    req.flash('success', 'Employee status updated');
    res.redirect('/supervisor/employees');
  } catch (err) {
    console.error('Error toggling employee:', err);
    req.flash('error', 'Failed to update employee');
    res.redirect('/supervisor/employees');
  }
});

module.exports = router;
