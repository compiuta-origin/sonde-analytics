import { createBrowserClient } from './supabase'

export async function getCurrentSubscription() {
  const supabase = createBrowserClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .single()

  return data
}

export function hasProAccess(subscription: any): boolean {
  if (!subscription) return false
  
  if (subscription.plan === 'enterprise') return true
  
  if (subscription.plan === 'pro') {
    const validStatuses = ['trialing', 'active']
    return validStatuses.includes(subscription.status)
  }
  
  return false
}
