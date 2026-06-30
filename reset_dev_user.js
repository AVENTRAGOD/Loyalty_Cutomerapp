import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function resetDevUser() {
  const userName = 'Test_User1';
  
  console.log(`Resetting data for user: ${userName}...`);

  // 1. Delete all transactions for the user
  const { error: txError } = await supabase
    .from('transactions')
    .delete()
    .eq('member', userName);

  if (txError) {
    console.error('Error deleting transactions:', txError);
    return;
  }
  console.log(`Cleared all transactions for ${userName}.`);

  // 2. Reset points to 0 and tier to Bronze
  const { error: updateError } = await supabase
    .from('members')
    .update({ points: 0, tier: 'Bronze' })
    .eq('name', userName);

  if (updateError) {
    console.error('Error resetting member points:', updateError);
    return;
  }
  
  console.log(`Reset ${userName} back to 0 points and Bronze tier.`);
  console.log('Reset complete!');
}

resetDevUser();
