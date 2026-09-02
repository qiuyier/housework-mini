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
    workProgressPercent: 0,
    workProgressLabel: '满勤规则未设置',
    workDays: 0,
    paidDays: 0,
    bankedDays: 0,
    compDays: 0,
    leaveBalance: '0',
    selectedAvailableLeave: '0',
    state: {
      dailySalary: '',
      months: {},
      monthRules: {}
    }
  },

  onLoad(options = {}) {
    const today = new Date()
    const state = this.loadState()
    const sharedMonth = this.parseSharedMonth(options)

    this.setData({
      state,
      dailySalary: state.dailySalary || '',
      currentYear: sharedMonth.year || today.getFullYear(),
      currentMonth: sharedMonth.month || today.getMonth() + 1
    }, () => {
      this.refreshMonth()
    })

    this.showShareMenu()
  },

  onShareAppMessage() {
    return {
      title: '家政工资计算器',
      path: this.getSharePath()
    }
  },

  onShareTimeline() {
    return {
      title: '家政工资计算器',
      query: this.getShareQuery()
    }
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

  showShareMenu() {
    if (!wx.showShareMenu) {
      return
    }

    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
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
      selectedAmountLabel: this.getDayAmountLabel(record),
      selectedAvailableLeave: this.formatMoney(this.getLeaveBalanceBefore(selectedDate))
    })
  },

  setSelectedType(event) {
    const type = event.currentTarget.dataset.type
    const selectedDate = this.data.selectedDate

    if (!selectedDate) {
      return
    }

    let nextRecord = { ...DEFAULT_RECORD }

    if (type === 'work') {
      nextRecord = { type: 'work', multiplier: this.getWorkMultiplier(this.data.selectedRecord) }
    } else if (type === 'paid') {
      nextRecord = { type: 'paid', multiplier: this.getPaidMultiplier(this.data.selectedRecord) }
    } else if (type === 'bank' || type === 'comp') {
      nextRecord = { type, multiplier: '1' }
    }

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
    const previousRecord = monthRecords[date]

    monthRecords[date] = {
      type: record.type,
      multiplier: this.normalizeNumber(record.multiplier)
    }
    nextState.months[monthKey] = monthRecords

    if (!this.hasValidLeaveLedger(nextState)) {
      const message = previousRecord && previousRecord.type === 'bank'
        ? '这天攒的假已被后续调休使用'
        : '调休余额不足，请先选择一天“攒假”'

      this.showToast(message)
      return
    }

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

    if (!this.hasValidLeaveLedger(nextState)) {
      this.showToast('这天攒的假已被后续调休使用')
      return
    }

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
      workProgressPercent: this.getWorkProgressPercent(totals.attendanceDays, monthRule.expectedWorkDays),
      workProgressLabel: this.getWorkProgressLabel(totals.attendanceDays, monthRule),
      workDays: totals.workDays,
      paidDays: totals.paidDays,
      bankedDays: totals.bankedDays,
      compDays: totals.compDays,
      leaveBalance: this.formatMoney(this.getLeaveBalanceUntil(`${monthKey}-31`)),
      selectedAvailableLeave: selectedDate
        ? this.formatMoney(this.getLeaveBalanceBefore(selectedDate))
        : '0'
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

      const recordType = day.record.type
      const paidAmount = recordType === 'paid' ? this.calculateRecordAmount(day.record) : 0
      const regularWorkUnit = recordType === 'work' ? Number(day.record.multiplier) || 1 : 0
      const bankedUnit = recordType === 'bank' ? 1 : 0
      const compUnit = recordType === 'comp' ? 1 : 0

      return {
        dailyAmount: total.dailyAmount + this.calculateRecordAmount(day.record),
        paidAmount: total.paidAmount + paidAmount,
        workDays: total.workDays + regularWorkUnit + bankedUnit,
        attendanceDays: total.attendanceDays + regularWorkUnit + compUnit,
        paidDays: total.paidDays + (recordType === 'paid' ? 1 : 0),
        bankedDays: total.bankedDays + bankedUnit,
        compDays: total.compDays + compUnit
      }
    }, {
      dailyAmount: 0,
      paidAmount: 0,
      workDays: 0,
      attendanceDays: 0,
      paidDays: 0,
      bankedDays: 0,
      compDays: 0
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
    const workBaseAmount = fullMonthSalary + ((totals.attendanceDays - expectedWorkDays) * dailySalary)

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

    if (record.type === 'comp') {
      return dailySalary
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

    if (record.type === 'bank') {
      return '攒'
    }

    if (record.type === 'comp') {
      return '调'
    }

    return ''
  },

  getDayAmountLabel(record) {
    if (record.type === 'bank') {
      return '不额外计薪 · 调休 +1 天'
    }

    if (record.type === 'comp') {
      return '按 1 天计薪 · 调休 -1 天'
    }

    return `当天工资 ¥${this.formatMoney(this.calculateRecordAmount(record))}`
  },

  getLeaveEntries(state = this.data.state) {
    const entries = []

    Object.keys(state.months || {}).forEach((monthKey) => {
      const monthRecords = state.months[monthKey] || {}

      Object.keys(monthRecords).forEach((date) => {
        const record = monthRecords[date]

        if (record.type === 'bank' || record.type === 'comp') {
          entries.push({
            date,
            change: record.type === 'bank' ? 1 : -1
          })
        }
      })
    })

    return entries.sort((left, right) => left.date.localeCompare(right.date))
  },

  getLeaveBalanceUntil(dateText, state = this.data.state, includeDate = true) {
    return this.getLeaveEntries(state).reduce((balance, entry) => {
      const isInRange = includeDate ? entry.date <= dateText : entry.date < dateText
      return isInRange ? balance + entry.change : balance
    }, 0)
  },

  getLeaveBalanceBefore(dateText, state = this.data.state) {
    return this.getLeaveBalanceUntil(dateText, state, false)
  },

  hasValidLeaveLedger(state) {
    let balance = 0

    return this.getLeaveEntries(state).every((entry) => {
      balance += entry.change
      return balance >= 0
    })
  },

  showToast(title) {
    if (wx.showToast) {
      wx.showToast({
        title,
        icon: 'none'
      })
    }
  },

  getWorkProgressPercent(workDays, expectedWorkDays) {
    const expected = Number(expectedWorkDays) || 0

    if (!expected) {
      return 0
    }

    return Math.min(100, Math.max(0, Math.round((Number(workDays) / expected) * 100)))
  },

  getWorkProgressLabel(workDays, monthRule) {
    const expected = Number(monthRule.expectedWorkDays) || 0

    if (!expected) {
      return '满勤规则未设置'
    }

    const diff = Number(workDays) - expected

    if (diff === 0) {
      return '已达满勤'
    }

    if (diff > 0) {
      return `已超 ${this.formatMoney(diff)} 天`
    }

    return `还差 ${this.formatMoney(Math.abs(diff))} 天`
  },

  getNormalizedRecordMultiplier(record) {
    if (record.type === 'work') {
      return this.getWorkMultiplier(record)
    }

    if (record.type === 'bank' || record.type === 'comp') {
      return '1'
    }

    return this.normalizeNumber(record.multiplier)
  },

  getWorkMultiplier(record) {
    return String(record.multiplier) === '0.5' ? '0.5' : '1'
  },

  getPaidMultiplier(record) {
    return record.type === 'paid' ? record.multiplier || 2 : 2
  },

  getSharePath() {
    const query = this.getShareQuery()
    return query ? `/pages/index/index?${query}` : '/pages/index/index'
  },

  getShareQuery() {
    const { currentYear, currentMonth } = this.data

    if (!currentYear || !currentMonth) {
      return ''
    }

    return `year=${currentYear}&month=${currentMonth}`
  },

  parseSharedMonth(options) {
    const year = Number(options.year)
    const month = Number(options.month)

    if (!Number.isInteger(year) || !Number.isInteger(month) || year < 1900 || month < 1 || month > 12) {
      return {}
    }

    return {
      year,
      month
    }
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
