import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixTiers() {
  const { data: members, error } = await supabase.from('members').select('*');
  if (error) {
    console.error('Error fetching members:', error);
    return;
  }

  for (const member of members) {
    let newTier = 'Bronze';
    if (member.points >= 10000) newTier = 'Platinum';
    else if (member.points >= 5000) newTier = 'Gold';
    else if (member.points >= 1000) newTier = 'Silver';

    if (member.tier !== newTier) {
      console.log(`Updating ${member.name} from ${member.tier} to ${newTier}`);
      await supabase.from('members').update({ tier: newTier }).eq('id', member.id);
    }
  }
  console.log('Done fixing tiers.');
}

fixTiers();
