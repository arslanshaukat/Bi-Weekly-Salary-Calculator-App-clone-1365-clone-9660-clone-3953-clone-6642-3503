import { supabase } from '../supabase.js';

const inFlightRequests = new Map();

// Helper constants for time calculations (in minutes from midnight)
const SHIFT_START = 8 * 60; // 08:00
const LUNCH_START = 12 * 60; // 12:00
const LUNCH_END = 13 * 60; // 13:00
const SHIFT_END = 17 * 60; // 17:00

export const employeeService = {
  async deduplicate(key, fetcher) {
    if (inFlightRequests.has(key)) return inFlightRequests.get(key);
    const promise = fetcher().finally(() => inFlightRequests.delete(key));
    inFlightRequests.set(key, promise);
    return promise;
  },

  // --- HOLIDAY MANAGEMENT ---
  async getHolidays() {
    const { data, error } = await supabase
      .from('holidays_1773420000000')
      .select('*')
      .order('date', { ascending: true });
    if (error) throw error;
    return data;
  },

  async upsertHoliday(holidayData) {
    const { data, error } = await supabase
      .from('holidays_1773420000000')
      .upsert(holidayData, { onConflict: 'date' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteHoliday(id) {
    const { error } = await supabase
      .from('holidays_1773420000000')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // --- EMPLOYEE MGMT ---
  async createEmployee(employeeData) {
    const { data, error } = await supabase.from('employees').insert([employeeData]).select();
    if (error) throw error;
    return data[0];
  },

  async updateEmployee(id, employeeData) {
    const { data, error } = await supabase.from('employees').update(employeeData).eq('id', id).select();
    if (error) throw error;
    return data[0];
  },

  async getEmployees(columns = 'id, employee_id, name, department, position, daily_salary, is_active, employee_type') {
    return this.deduplicate(`list-${columns}`, async () => {
      const { data, error } = await supabase.from('employees').select(columns).order('name', { ascending: true });
      if (error) throw error;
      return data;
    });
  },

  async getEmployeeBasicInfo() {
    return this.deduplicate('basic-info', async () => {
      const { data, error } = await supabase.from('employees').select('id, name, position, daily_salary, employee_type').eq('is_active', true).order('name', { ascending: true });
      if (error) throw error;
      return data;
    });
  },

  async getEmployeeById(id) {
    const { data, error } = await supabase.from('employees').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async deleteEmployee(id) {
    const { error } = await supabase.from('employees').delete().eq('id', id);
    if (error) throw error;
  },

  // --- DEDUCTIONS ---
  async getDeductionHistory(employeeId) {
    const { data, error } = await supabase
      .from('employee_deductions')
      .select('*')
      .eq('employee_id', employeeId)
      .order('date', { ascending: false });
    if (error) throw error;
    return data;
  },

  async getPendingDeductions(employeeId, includeRecordId = null) {
    let query = supabase
      .from('employee_deductions')
      .select('*')
      .eq('employee_id', employeeId);

    if (includeRecordId) {
      query = query.or(`is_processed.eq.false,processed_in_record_id.eq.${includeRecordId}`);
    } else {
      query = query.eq('is_processed', false);
    }

    const { data, error } = await query.order('date', { ascending: true });
    if (error) throw error;
    return data;
  },

  async createDeduction(deductionData) {
    const { data, error } = await supabase.from('employee_deductions').insert([deductionData]).select();
    if (error) throw error;
    return data[0];
  },

  async updateDeductionStatus(id, isProcessed) {
    const { error } = await supabase
      .from('employee_deductions')
      .update({ is_processed: isProcessed, processed_in_record_id: null })
      .eq('id', id);
    if (error) throw error;
  },

  async deleteDeduction(id) {
    const { error } = await supabase.from('employee_deductions').delete().eq('id', id);
    if (error) throw error;
  },

  // --- PAYROLL RECORDS ---
  async getPayRecords(employeeId, limit = 100) {
    const { data, error } = await supabase
      .from('pay_records')
      .select('*')
      .eq('employee_id', employeeId)
      .order('start_date', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  },

  async createPayRecord(payData, appliedDeductions = []) {
    const { data: record, error: recordError } = await supabase
      .from('pay_records')
      .insert([{ ...payData, applied_deductions: appliedDeductions }])
      .select()
      .single();

    if (recordError) throw recordError;

    if (appliedDeductions.length > 0) {
      for (const applied of appliedDeductions) {
        await supabase
          .from('employee_deductions')
          .update({ is_processed: true, processed_in_record_id: record.id })
          .eq('id', applied.id);
      }
    }
    return record;
  },

  async updatePayRecord(id, payData, appliedDeductions = []) {
    await supabase
      .from('employee_deductions')
      .update({ is_processed: false, processed_in_record_id: null })
      .eq('processed_in_record_id', id);

    const { data: record, error } = await supabase
      .from('pay_records')
      .update({ ...payData, applied_deductions: appliedDeductions })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (appliedDeductions.length > 0) {
      for (const applied of appliedDeductions) {
        await supabase
          .from('employee_deductions')
          .update({ is_processed: true, processed_in_record_id: id })
          .eq('id', applied.id);
      }
    }
    return record;
  },

  async getPayRecordById(id) {
    const { data, error } = await supabase.from('pay_records').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async deletePayRecord(id) {
    await supabase
      .from('employee_deductions')
      .update({ is_processed: false, processed_in_record_id: null })
      .eq('processed_in_record_id', id);
    const { error } = await supabase.from('pay_records').delete().eq('id', id);
    if (error) throw error;
  },

  async getPayRecordsWithEmployees(limit = 1000) {
    const { data, error } = await supabase.from('pay_records').select(`
      id,
      pay_period,
      start_date,
      end_date,
      net_pay,
      employee_id,
      sss_contribution,
      philhealth_contribution,
      pagibig_contribution,
      thirteenth_month,
      thirteenth_month_days,
      basic_salary,
      overtime_hours,
      overtime_pay,
      late_deduction,
      undertime_deduction,
      reg_holiday_pay,
      spec_holiday_pay,
      holiday_pay,
      allowances,
      allowance_description,
      cash_advance,
      food_allowance,
      other_deductions,
      days_present,
      late_minutes,
      undertime_minutes,
      applied_deductions,
      gross_pay,
      created_at,
      employees (name, position, department, employee_id, employee_type, daily_salary)
    `).order('start_date', { ascending: false }).limit(limit);
    if (error) throw error;
    return data;
  },

  // --- ATTENDANCE ---
  async getAttendance(employeeId, startDate, endDate) {
    const { data, error } = await supabase.from('attendance').select('*').eq('employee_id', employeeId).gte('date', startDate).lte('date', endDate).order('date', { ascending: true });
    if (error) throw error;
    return data;
  },

  async createAttendance(data) {
    const { error } = await supabase.from('attendance').upsert({ ...data, modified_at: new Date().toISOString() }, { onConflict: 'employee_id, date' });
    if (error) throw error;
  },

  async bulkCreateAttendance(records) {
    const timestampedRecords = records.map(r => ({ ...r, modified_at: new Date().toISOString() }));
    const { error } = await supabase.from('attendance').upsert(timestampedRecords, { onConflict: 'employee_id, date' });
    if (error) throw error;
  },

  async deleteAttendance(id) {
    const { error } = await supabase.from('attendance').delete().eq('id', id);
    if (error) throw error;
  },

  async deleteAttendanceRange(employeeId, startDate, endDate) {
    const { error } = await supabase.from('attendance')
      .delete()
      .eq('employee_id', employeeId)
      .gte('date', startDate)
      .lte('date', endDate);
    if (error) throw error;
  },

  async getAttendanceSummary(employeeId, startDate, endDate) {
    const [attendance, holidays] = await Promise.all([
      this.getAttendance(employeeId, startDate, endDate),
      this.getHolidays()
    ]);

    const holidayMap = {};
    holidays.forEach(h => {
      holidayMap[h.date] = h;
    });

    let stats = {
      regularDaysPresent: 0,
      regularHolidaysPresent: 0,
      regularHolidaysAbsent: 0,
      specialHolidaysPresent: 0,
      totalLateMinutes: 0,
      totalUndertimeMinutes: 0,
      totalOvertimeMinutes: 0,
      thirteenthMonthDays: 0,
      totalRecords: attendance.length
    };

    attendance.forEach(log => {
      const holiday = holidayMap[log.date];
      const isPresent = ['present', 'late', 'holiday', 'undertime'].includes(log.status);
      let dayWeight = 1.0;
      let checkinMins = 0;
      let checkoutMins = 0;

      if (log.check_in_time && isPresent) {
        const [h, m] = log.check_in_time.split(':').map(Number);
        checkinMins = (h * 60) + m;
        if (checkinMins >= LUNCH_START) {
          dayWeight = 0.5;
        }
      }

      if (log.check_out_time && isPresent) {
        const [h, m] = log.check_out_time.split(':').map(Number);
        checkoutMins = (h * 60) + m;
      }

      // Variable name fix: removed space in isEligibleFor13th
      const isEligibleFor13th = isPresent && checkinMins < LUNCH_START && (log.undertime_minutes || 0) < 240;

      if (holiday) {
        if (holiday.type === 'regular') {
          isPresent ? stats.regularHolidaysPresent += dayWeight : stats.regularHolidaysAbsent++;
        } else {
          isPresent ? stats.specialHolidaysPresent += dayWeight : null;
        }
      } else if (isPresent) {
        stats.regularDaysPresent += dayWeight;
      }

      if (isEligibleFor13th) {
        stats.thirteenthMonthDays++;
      }

      // FIX: Suppress late minutes if it's a half day (Check-in >= 12:00 PM)
      if (checkinMins < LUNCH_START) {
        stats.totalLateMinutes += (log.late_minutes || 0);
      }
      
      stats.totalUndertimeMinutes += (log.undertime_minutes || 0);

      if (isPresent) {
        if (checkinMins < SHIFT_START) stats.totalOvertimeMinutes += (SHIFT_START - checkinMins);
        if (checkoutMins > SHIFT_END) stats.totalOvertimeMinutes += (checkoutMins - SHIFT_END);
      }
    });

    return stats;
  }
};