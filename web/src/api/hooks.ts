import { useMutation, useQuery } from '@tanstack/react-query'
import { broker } from './broker'
import { useTradingStore, type PlaceOrderInput } from '../store/tradingStore'
import type { SymbolCode } from '../sim/instruments'

const toastError = (err: unknown) =>
  useTradingStore.getState().pushToast('error', err instanceof Error ? err.message : String(err))

export function useContracts() {
  return useQuery({ queryKey: ['contracts'], queryFn: broker.getContracts, staleTime: Infinity })
}

export function usePlaceOrder() {
  return useMutation({
    mutationFn: (input: PlaceOrderInput) => broker.placeOrder(input),
    onSuccess: (order) => {
      if (order.status === 'WORKING') useTradingStore.getState().pushToast('info', `委託已送出 #${order.id}`)
    },
    onError: toastError,
  })
}

/** 下單入口：開啟「下單確認」時先跳確認視窗，否則直接送出 */
export function useRequestOrder() {
  const place = usePlaceOrder()
  return (input: PlaceOrderInput) => {
    const { settings, setPendingOrder } = useTradingStore.getState()
    if (settings.confirmOrders) setPendingOrder(input)
    else place.mutate(input)
  }
}

export function useCancelOrder() {
  return useMutation({
    mutationFn: (id: string) => broker.cancelOrder(id),
    onSuccess: () => useTradingStore.getState().pushToast('info', '已刪單'),
    onError: toastError,
  })
}

export function useModifyOrder() {
  return useMutation({
    mutationFn: ({ id, price }: { id: string; price: number }) => broker.modifyOrder(id, price),
    onSuccess: (order) => {
      if (order.status === 'WORKING') useTradingStore.getState().pushToast('info', `改價成功 → ${order.price?.toLocaleString()}`)
    },
    onError: toastError,
  })
}

export function useClosePosition() {
  return useMutation({
    mutationFn: (symbol: SymbolCode) => broker.closePosition(symbol),
    onError: toastError,
  })
}

export function useCancelAll() {
  return useMutation({
    mutationFn: () => broker.cancelAll(),
    onSuccess: (count) => useTradingStore.getState().pushToast('info', `已刪除 ${count} 筆委託`),
    onError: toastError,
  })
}
