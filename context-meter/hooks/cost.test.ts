import { expect, test } from 'claude-code/testing'
import { budgetRow, budgetToast, overBudget, turnCost } from './cost'

test('turn cost is the increase since the last reading', () => {
  expect(turnCost(1.5, 2.25)).toBe(0.75)
})

test('no baseline yet gives no turn cost', () => {
  expect(turnCost(undefined, 1.5)).toBeUndefined()
})

test('a lower total is a reset, not a negative turn', () => {
  expect(turnCost(3, 0.4)).toBeUndefined()
})

test('an unchanged total costs nothing', () => {
  expect(turnCost(1.5, 1.5)).toBe(0)
})

test('no budget is never over', () => {
  expect(overBudget(999, undefined)).toBe(false)
})

test('at or above the budget is over', () => {
  expect(overBudget(4.99, 5)).toBe(false)
  expect(overBudget(5, 5)).toBe(true)
})

test('a budget of 0 is over as soon as any cost is reported', () => {
  expect(overBudget(0, 0)).toBe(true)
})

test('budget row shows spend against the budget when one is set', () => {
  expect(budgetRow(3.2, 5)).toBe('$3.20 of $5.00')
})

test('no budget gives no budget row', () => {
  expect(budgetRow(3.2, undefined)).toBeUndefined()
})

test('budget toast names the spend and the budget', () => {
  expect(budgetToast(5.1, 5)).toBe('Session cost is $5.10, over your $5.00 budget')
})
