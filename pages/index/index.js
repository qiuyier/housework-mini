const STORAGE_KEY = 'housework-salary-state-v1'

const DEFAULT_RECORD = {
  type: 'off',
  multiplier: 0
}

Page({
  data: {
    dailySalary: '',
    currentYear: 0,
    currentMonth: 0,
    monthKey: '',
    monthLabel: '',
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
    calendarDays: [],
    selectedDate: '',
    selectedDateLabel: '',
    selectedRecord: DEFAULT_RECORD,
    selectedAmountLabel: '当天工资 ¥0',
    monthTotal: '0',
    expectedWorkDays: '',
    fullMonthSalary: '',
    summaryModeLabel: '按当前日薪实时计算',
    workDays: 0,
    paidDays: 0,
    state: {
      dailySalary: '',
      months: {},
      monthRules: {}
    }
  },

  onLoad() {
    const today = new Date()
    const state = this.loadState()

    this.setData({
      state,
      dailySalary: state.dailySalary || '',
      currentYear: today.getFullYear(),
      currentMonth: today.getMonth() + 1
    }, () => {
      this.refreshMonth()
    })
  },

  loadState() {
    const saved = wx.getStorageSync(STORAGE_KEY)

    if (!saved || typeof saved !== 'object') {
      return {
        dailySalary: '',
        months: {},
        monthRules: {}
      }
    }

    return {
      dailySalary: saved.dailySalary || '',
      months: saved.months || {},
      monthRules: saved.monthRules || {}
    }
  },

  saveState(nextState) {
    wx.setStorageSync(STORAGE_KEY, nextState)
    this.setData({
      state: nextState
    })
  },

  onExpectedWorkDaysInput(event) {
    this.updateMonthRule({
      expectedWorkDays: this.normalizeNumber(event.detail.value)
    })
  },

  onFullMonthSalaryInput(event) {
    this.updateMonthRule({
      fullMonthSalary: this.normalizeNumber(event.detail.value)
    })
  },

  updateMonthRule(rulePatch) {
    const { currentYear, currentMonth } = this.data
    const monthKey = this.getMonthKey(currentYear, currentMonth)
    const nextState = this.cloneState()
    const currentRule = nextState.monthRules[monthKey] || {}

    nextState.monthRules[monthKey] = {
      ...currentRule,
      ...rulePatch
    }

    this.saveState(nextState)
    this.refreshMonth()
  },

  onSalaryInput(event) {
    const dailySalary = this.normalizeNumber(event.detail.value)
    const nextState = {
      ...this.data.state,
      dailySalary
    }

    this.saveState(nextState)
    this.setData({
      dailySalary
    }, () => {
      this.refreshMonth()
    })
  },

  goPrevMonth() {
    const { currentYear, currentMonth } = this.data
    const prev = currentMonth === 1
      ? { year: currentYear - 1, month: 12 }
      : { year: currentYear, month: currentMonth - 1 }

    this.setData({
      currentYear: prev.year,
      currentMonth: prev.month,
      selectedDate: ''
    }, () => {
      this.refreshMonth()
    })
  },

  goNextMonth() {
    const { currentYear, currentMonth } = this.data
    const next = currentMonth === 12
      ? { year: currentYear + 1, month: 1 }
      : { year: currentYear, month: currentMonth + 1 }

    this.setData({
      currentYear: next.year,
      currentMonth: next.month,
      selectedDate: ''
    }, () => {
      this.refreshMonth()
    })
  },

  selectDate(event) {
    const selectedDate = event.currentTarget.dataset.date
    const record = this.getRecord(selectedDate)

    this.setData({
      selectedDate,
      selectedDateLabel: this.formatDateLabel(selectedDate),
      selectedRecord: record,
      selectedAmountLabel: this.getDayAmountLabel(record)
    })
  },

  setSelectedType(event) {
    const type = event.currentTarget.dataset.type
    const selectedDate = this.data.selectedDate

    if (!selectedDate) {
      return
    }

    const nextRecord = type === 'work'
      ? { type: 'work', multiplier: this.getWorkMultiplier(this.data.selectedRecord) }
      : type === 'paid'
        ? { type: 'paid', multiplier: this.getPaidMultiplier(this.data.selectedRecord) }
        : { ...DEFAULT_RECORD }

    this.upsertRecord(selectedDate, nextRecord)
  },

  setWorkMultiplier(event) {
    const selectedDate = this.data.selectedDate
    const multiplier = event.currentTarget.dataset.multiplier

    if (!selectedDate) {
      return
    }

    this.upsertRecord(selectedDate, {
      type: 'work',
      multiplier
    })
  },

  onMultiplierInput(event) {
    const selectedDate = this.data.selectedDate

    if (!selectedDate) {
      return
    }

    const multiplier = this.normalizeNumber(event.detail.value)
    this.upsertRecord(selectedDate, {
      type: 'paid',
      multiplier
    })
  },

  clearSelectedDate() {
    const selectedDate = this.data.selectedDate

    if (!selectedDate) {
      return
    }

    this.removeRecord(selectedDate)
  },

  upsertRecord(date, record) {
    const monthKey = date.slice(0, 7)
    const nextState = this.cloneState()
    const monthRecords = {
      ...(nextState.months[monthKey] || {})
    }

    monthRecords[date] = {
      type: record.type,
      multiplier: this.normalizeNumber(record.multiplier)
    }
    nextState.months[monthKey] = monthRecords

    this.saveState(nextState)
    this.refreshMonth(date)
  },

  removeRecord(date) {
    const monthKey = date.slice(0, 7)
    const nextState = this.cloneState()
    const monthRecords = {
      ...(nextState.months[monthKey] || {})
    }

    delete monthRecords[date]
    nextState.months[monthKey] = monthRecords

    this.saveState(nextState)
    this.refreshMonth(date)
  },

  refreshMonth(selectedDate = this.data.selectedDate) {
    const { currentYear, currentMonth } = this.data
    const monthKey = this.getMonthKey(currentYear, currentMonth)
    const calendarDays = this.buildCalendar(currentYear, currentMonth)
    const totals = this.calculateMonth(calendarDays, monthKey)
    const monthRule = this.getMonthRule(monthKey)
    const selectedRecord = selectedDate ? this.getRecord(selectedDate) : DEFAULT_RECORD

    this.setData({
      monthKey,
      monthLabel: `${currentYear}年${currentMonth}月`,
      calendarDays,
      selectedDate,
      selectedDateLabel: selectedDate ? this.formatDateLabel(selectedDate) : '',
      selectedRecord,
      selectedAmountLabel: this.getDayAmountLabel(selectedRecord),
      monthTotal: this.formatMoney(totals.amount),
      expectedWorkDays: monthRule.expectedWorkDays,
      fullMonthSalary: monthRule.fullMonthSalary,
      summaryModeLabel: totals.modeLabel,
      workDays: totals.workDays,
      paidDays: totals.paidDays
    })
  },

  buildCalendar(year, month) {
    const firstDay = new Date(year, month - 1, 1)
    const startOffset = (firstDay.getDay() + 6) % 7
    const startDate = new Date(year, month - 1, 1 - startOffset)
    const days = []

    for (let index = 0; index < 42; index += 1) {
      const date = new Date(startDate)
      date.setDate(startDate.getDate() + index)

      const dateText = this.formatDate(date)
      const record = this.getRecord(dateText)

      days.push({
        key: dateText,
        date: dateText,
        day: date.getDate(),
        isCurrentMonth: date.getFullYear() === year && date.getMonth() + 1 === month,
        record: {
          ...record,
          label: this.getRecordLabel(record)
        }
      })
    }

    return days
  },

  calculateMonth(calendarDays, monthKey = this.data.monthKey) {
    const totals = calendarDays.reduce((total, day) => {
      if (!day.isCurrentMonth) {
        return total
      }

      const paidAmount = day.record.type === 'paid' ? this.calculateRecordAmount(day.record) : 0
      const workUnit = day.record.type === 'work' ? Number(day.record.multiplier) || 1 : 0

      return {
        dailyAmount: total.dailyAmount + this.calculateRecordAmount(day.record),
        paidAmount: total.paidAmount + paidAmount,
        workDays: total.workDays + workUnit,
        paidDays: total.paidDays + (day.record.type === 'paid' ? 1 : 0)
      }
    }, {
      dailyAmount: 0,
      paidAmount: 0,
      workDays: 0,
      paidDays: 0
    })

    const monthRule = this.getMonthRule(monthKey)
    const hasFullMonthRule = Number(monthRule.expectedWorkDays) > 0 && Number(monthRule.fullMonthSalary) > 0

    if (!hasFullMonthRule) {
      return {
        ...totals,
        amount: totals.dailyAmount,
        modeLabel: '按当前日薪实时计算'
      }
    }

    const dailySalary = Number(this.data.dailySalary) || 0
    const expectedWorkDays = Number(monthRule.expectedWorkDays)
    const fullMonthSalary = Number(monthRule.fullMonthSalary)
    const workBaseAmount = fullMonthSalary + ((totals.workDays - expectedWorkDays) * dailySalary)

    return {
      ...totals,
      amount: workBaseAmount + totals.paidAmount,
      modeLabel: `满 ${this.formatMoney(expectedWorkDays)} 天 ¥${this.formatMoney(fullMonthSalary)}，差额按日薪`
    }
  },

  calculateRecordAmount(record) {
    const dailySalary = Number(this.data.dailySalary) || 0
    const multiplier = Number(record.multiplier) || 0

    if (record.type === 'work') {
      return dailySalary * this.getWorkMultiplier(record)
    }

    if (record.type === 'paid') {
      return dailySalary * multiplier
    }

    return 0
  },

  getRecord(date) {
    const monthKey = date.slice(0, 7)
    const monthRecords = this.data.state.months[monthKey] || {}
    const record = monthRecords[date]

    if (!record) {
      return { ...DEFAULT_RECORD }
    }

    return {
      type: record.type || 'off',
      multiplier: this.getNormalizedRecordMultiplier(record)
    }
  },

  getMonthRule(monthKey = this.data.monthKey) {
    const rule = this.data.state.monthRules[monthKey] || {}

    return {
      expectedWorkDays: this.normalizeNumber(rule.expectedWorkDays),
      fullMonthSalary: this.normalizeNumber(rule.fullMonthSalary)
    }
  },

  getRecordLabel(record) {
    if (record.type === 'work') {
      return this.getWorkMultiplier(record) === '0.5' ? '半班' : '班'
    }

    if (record.type === 'paid') {
      return `${record.multiplier || 0}薪`
    }

    return ''
  },

  getDayAmountLabel(record) {
    return `当天工资 ¥${this.formatMoney(this.calculateRecordAmount(record))}`
  },

  getNormalizedRecordMultiplier(record) {
    if (record.type === 'work') {
      return this.getWorkMultiplier(record)
    }

    return this.normalizeNumber(record.multiplier)
  },

  getWorkMultiplier(record) {
    return String(record.multiplier) === '0.5' ? '0.5' : '1'
  },

  getPaidMultiplier(record) {
    return record.type === 'paid' ? record.multiplier || 2 : 2
  },

  formatDateLabel(dateText) {
    const parts = dateText.split('-')
    return `${Number(parts[1])}月${Number(parts[2])}日`
  },

  getMonthKey(year, month) {
    return `${year}-${String(month).padStart(2, '0')}`
  },

  formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  },

  formatMoney(value) {
    const number = Number(value) || 0

    if (Number.isInteger(number)) {
      return String(number)
    }

    return number.toFixed(2).replace(/\.?0+$/, '')
  },

  normalizeNumber(value) {
    const text = String(value || '').replace(/[^\d.]/g, '')
    const parts = text.split('.')

    if (parts.length <= 1) {
      return parts[0]
    }

    return `${parts[0]}.${parts.slice(1).join('')}`
  },

  cloneState() {
    return {
      dailySalary: this.data.state.dailySalary,
      months: {
        ...this.data.state.months
      },
      monthRules: {
        ...this.data.state.monthRules
      }
    }
  }
})
