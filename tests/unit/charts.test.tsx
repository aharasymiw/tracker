import { describe, it, expect } from 'vite-plus/test'
import { render, screen, fireEvent } from '@testing-library/react'
import { TrendChart } from '@/components/insights/TrendChart'
import { TypeChart } from '@/components/insights/TypeChart'
import { WeeklyComparison } from '@/components/insights/WeeklyComparison'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const week = [
  { date: 'Sun', total: 0 },
  { date: 'Mon', total: 3 },
  { date: 'Tue', total: 1.5 },
  { date: 'Wed', total: 0 },
  { date: 'Thu', total: 2 },
  { date: 'Fri', total: 4 },
  { date: 'Sat', total: 1 },
]

describe('TrendChart', () => {
  it('renders one bar per day', () => {
    const { container } = render(<TrendChart data={week} />)
    expect(container.querySelectorAll('path')).toHaveLength(7)
  })

  it('labels every day for short ranges', () => {
    render(<TrendChart data={week} />)
    for (const d of week) expect(screen.getByText(d.date)).toBeInTheDocument()
  })

  it('shows a value tooltip when a bar is tapped', () => {
    const { container } = render(<TrendChart data={week} />)
    const hits = container.querySelectorAll('rect[fill="transparent"]')
    expect(hits).toHaveLength(7)
    fireEvent.click(hits[1])
    expect(screen.getByText('Mon · 3')).toBeInTheDocument()
  })

  it('thins x-axis labels for a year of daily bars', () => {
    const year = Array.from({ length: 365 }, (_, i) => ({ date: `D${i}`, total: i % 7 }))
    const { container } = render(<TrendChart data={year} />)
    expect(container.querySelectorAll('path')).toHaveLength(365)
    expect(container.querySelectorAll('text').length).toBeLessThan(15)
  })

  it('handles all-zero data without crashing', () => {
    const zeros = week.map((d) => ({ ...d, total: 0 }))
    const { container } = render(<TrendChart data={zeros} />)
    expect(container.querySelectorAll('path')).toHaveLength(7)
  })

  it('handles a single data point', () => {
    const { container } = render(<TrendChart data={[{ date: 'Mon', total: 2 }]} />)
    expect(container.querySelectorAll('path')).toHaveLength(1)
  })

  it('renders an empty state for no data', () => {
    render(<TrendChart data={[]} />)
    expect(screen.getByText('No data')).toBeInTheDocument()
  })
})

describe('TypeChart', () => {
  const types = [
    { type: 'flower', total: 5 },
    { type: 'edible', total: 2.5 },
    { type: 'vape', total: 2.5 },
  ]

  it('renders one segment per type plus a legend', () => {
    const { container } = render(<TypeChart data={types} />)
    expect(container.querySelectorAll('path')).toHaveLength(3)
    for (const d of types) {
      expect(screen.getByRole('button', { name: d.type })).toBeInTheDocument()
    }
  })

  it('shows the grand total in the center', () => {
    render(<TypeChart data={types} />)
    expect(screen.getByText('10.0')).toBeInTheDocument()
  })

  it('shows the selected type value when its legend entry is tapped', () => {
    render(<TypeChart data={types} />)
    fireEvent.click(screen.getByRole('button', { name: 'flower' }))
    expect(screen.getByText('5.0')).toBeInTheDocument()
  })

  it('renders a single type as a full ring', () => {
    const { container } = render(<TypeChart data={[{ type: 'vape', total: 3 }]} />)
    expect(container.querySelectorAll('circle')).toHaveLength(1)
    expect(container.querySelectorAll('path')).toHaveLength(0)
  })

  it('renders a muted ring when all totals are zero', () => {
    const { container } = render(<TypeChart data={[{ type: 'flower', total: 0 }]} />)
    expect(container.querySelectorAll('circle')).toHaveLength(1)
    expect(screen.getByText('0.0')).toBeInTheDocument()
  })

  it('renders an empty state for no data', () => {
    render(<TypeChart data={[]} />)
    expect(screen.getByText('No data')).toBeInTheDocument()
  })
})

describe('WeeklyComparison', () => {
  const sample = DAYS.map((day, i) => ({ day, thisWeek: i + 1, lastWeek: 8 - i }))

  it('renders two bars per day and a legend', () => {
    const { container } = render(<WeeklyComparison data={sample} />)
    expect(container.querySelectorAll('path')).toHaveLength(14)
    expect(screen.getByText('This week')).toBeInTheDocument()
    expect(screen.getByText('Last week')).toBeInTheDocument()
  })

  it('omits zero bars but keeps each day slot tappable', () => {
    const zeros = DAYS.map((day) => ({ day, thisWeek: 0, lastWeek: 0 }))
    const { container } = render(<WeeklyComparison data={zeros} />)
    expect(container.querySelectorAll('path')).toHaveLength(0)
    expect(container.querySelectorAll('rect[fill="transparent"]')).toHaveLength(7)
  })

  it('shows both values when a day is tapped', () => {
    const { container } = render(<WeeklyComparison data={sample} />)
    const hits = container.querySelectorAll('rect[fill="transparent"]')
    fireEvent.click(hits[2])
    expect(screen.getByText('This week: 3')).toBeInTheDocument()
    expect(screen.getByText('Last week: 6')).toBeInTheDocument()
  })

  it('renders an empty state for no data', () => {
    render(<WeeklyComparison data={[]} />)
    expect(screen.getByText('No data')).toBeInTheDocument()
  })
})
