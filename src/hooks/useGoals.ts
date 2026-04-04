import { useData } from '@/hooks/useData'

export function useGoals() {
  const { goals, saveGoal, deleteGoal } = useData()
  return { goals, saveGoal, deleteGoal }
}
