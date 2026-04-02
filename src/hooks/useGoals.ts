import { useData } from '@/contexts/DataContext'

export function useGoals() {
  const { goals, saveGoal, deleteGoal } = useData()
  return { goals, saveGoal, deleteGoal }
}
