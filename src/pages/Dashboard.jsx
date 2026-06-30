import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { Home, Gift, Clock, LogOut, QrCode, X, User, Camera } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5QrcodeScanner } from 'html5-qrcode';

const TIERS = {
  'Bronze': { points: 0, color: '#d97706', next: 'Silver' },
  'Silver': { points: 1000, color: '#94a3b8', next: 'Gold' },
  'Gold': { points: 5000, color: '#eab308', next: 'Platinum' },
  'Platinum': { points: 10000, color: '#64748b', next: null }
};

const Dashboard = () => {
  const { user, logout, login } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('home');
  const [rewards, setRewards] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [showQR, setShowQR] = useState(false);
  
  // Claiming logic
  const [rewardToClaim, setRewardToClaim] = useState(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [activeVoucher, setActiveVoucher] = useState(null);

  // Profile Update Logic
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileName, setProfileName] = useState(user?.name || '');

  // Scanner Logic
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [isProcessingScan, setIsProcessingScan] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    setProfileName(user.name);
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, navigate]);

  useEffect(() => {
    let scanner = null;
    if (isScanning) {
      scanner = new Html5QrcodeScanner('reader', { 
        qrbox: { width: 250, height: 250 }, 
        fps: 5 
      });
      
      scanner.render(
        (result) => {
          scanner.clear();
          setIsScanning(false);
          handleScanResult(result);
        },
        (error) => {
          // ignore background errors
        }
      );
    }
    
    return () => {
      if (scanner) {
        scanner.clear().catch(e => console.error(e));
      }
    };
  }, [isScanning]);

  const fetchData = async () => {
    if (!user) return;
    
    // Refresh user data (points, tier) silently
    await login(user.member_code);
    
    const { data: rewardsData } = await supabase.from('rewards').select('*').eq('status', 'Available').order('points', { ascending: true });
    if (rewardsData) setRewards(rewardsData);

    const { data: txData } = await supabase.from('transactions').select('*').eq('member', user.name).order('transaction_date', { ascending: false });
    if (txData) setTransactions(txData);
    
    const { data: promoData } = await supabase.from('promotions').select('*').eq('status', 'Active');
    if (promoData) setPromotions(promoData);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!profileName.trim() || profileName === user.name) return;
    setIsUpdatingProfile(true);
    try {
      const { error } = await supabase.from('members').update({ name: profileName }).eq('id', user.id);
      if (error) throw error;
      await login(user.member_code);
      alert('Profile updated successfully!');
    } catch (err) {
      alert('Failed to update profile.');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleClaimReward = async () => {
    if (!rewardToClaim || !user || isClaiming) return;
    setIsClaiming(true);
    try {
      const { data: txData, error: txError } = await supabase.from('transactions').insert([{
        member: user.name,
        type: 'pending_redemption',
        points: -rewardToClaim.points
      }]).select();
      
      if (txError) throw txError;
      
      const newPoints = user.points - rewardToClaim.points;
      const { error: memberError } = await supabase.from('members').update({ points: newPoints }).eq('id', user.id);
      if (memberError) throw memberError;
      
      await login(user.member_code); 
      await fetchData();
      setRewardToClaim(null);
      
      // Open the voucher right away
      if (txData && txData.length > 0) {
        setActiveVoucher(txData[0]);
      }
    } catch (error) {
      console.error('Claim Reward Error:', error);
      alert('Failed to create voucher. Please try again.');
    } finally {
      setIsClaiming(false);
    }
  };

  const handleScanResult = async (result) => {
    try {
      setIsProcessingScan(true);
      const data = JSON.parse(result);
      
      if (data.action === 'earn' && data.id) {
        // Fetch the transaction
        const { data: txData, error: txError } = await supabase
          .from('transactions')
          .select('*')
          .eq('id', data.id)
          .single();
          
        if (txError || !txData) throw new Error('Invalid QR code.');
        
        if (txData.member !== 'PENDING_QR') {
          throw new Error('This QR code has already been scanned.');
        }

        // Claim the transaction for this user
        const { error: updateTxError } = await supabase
          .from('transactions')
          .update({ member: user.name, type: 'purchase' })
          .eq('id', data.id);
          
        if (updateTxError) throw updateTxError;
        
        // Update user points and tier
        const newPoints = user.points + txData.points;
        let newTier = 'Bronze';
        if (newPoints >= 10000) newTier = 'Platinum';
        else if (newPoints >= 5000) newTier = 'Gold';
        else if (newPoints >= 1000) newTier = 'Silver';

        const { error: memberError } = await supabase
          .from('members')
          .update({ points: newPoints, tier: newTier })
          .eq('id', user.id);
          
        if (memberError) throw memberError;

        await login(user.member_code);
        await fetchData();
        setScanResult({ success: true, message: `Successfully earned ${txData.points} points!` });
      } else {
        throw new Error('Invalid QR code format.');
      }
    } catch (error) {
      console.error(error);
      setScanResult({ success: false, message: error.message || 'Failed to process QR code.' });
    } finally {
      setIsProcessingScan(false);
    }
  };

  if (!user) return null;

  const tierData = TIERS[user.tier] || TIERS['Bronze'];
  const nextTierData = tierData.next ? TIERS[tierData.next] : null;
  const pointsToNext = nextTierData ? Math.max(0, nextTierData.points - user.points) : 0;
  const progressToNext = nextTierData ? Math.min(100, Math.max(0, (user.points / nextTierData.points) * 100)) : 100;

  const pendingVouchers = transactions.filter(tx => tx.type === 'pending_redemption');

  return (
    <div 
      className="min-h-screen pb-24 bg-white transition-colors duration-500 relative"
      style={{ '--primary': tierData.color }}
    >
      {/* Header */}
      <header className="px-6 pt-14 pb-10 rounded-b-[2.5rem] shadow-sm relative overflow-hidden bg-slate-50 border-b border-slate-100 z-10">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 mix-blend-multiply"></div>
        <div className="relative z-10 flex justify-between items-center text-slate-800">
          <div>
            <p className="text-slate-500 text-xs font-semibold tracking-widest uppercase mb-1">Welcome Back</p>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--primary)]">{user.name}</h1>
          </div>
          <div className="flex gap-3">
            <button onClick={handleLogout} className="p-2.5 bg-white backdrop-blur-md border border-slate-200 rounded-full hover:bg-slate-50 transition-all shadow-sm active:scale-95 text-slate-400 hover:text-rose-500">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="p-6 relative z-20 -mt-6">
        {activeTab === 'home' && (
          <div className="space-y-6">
            
            {/* Active Promotions Banner */}
            {promotions.map(promo => (
              <div key={promo.id} className="relative overflow-hidden bg-gradient-to-r from-amber-500 to-orange-500 rounded-3xl p-6 text-white shadow-md transition-all duration-300">
                <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white opacity-20 rounded-full blur-2xl"></div>
                <div className="relative z-10">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-white text-[10px] font-bold tracking-widest uppercase mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                    Active Promotion
                  </div>
                  <h3 className="text-2xl font-bold mb-1 tracking-tight">{promo.title}</h3>
                  <p className="text-white/90 text-sm font-medium opacity-90">{promo.description}</p>
                  <p className="text-white/70 text-xs mt-3 uppercase tracking-widest font-semibold flex items-center gap-1">
                    <Clock size={12} /> Valid until {new Date(promo.end_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}

            {/* Premium Points Card */}
            <div className="bg-white backdrop-blur-2xl rounded-[2rem] p-8 shadow-lg border border-slate-100 flex flex-col items-center text-center relative overflow-hidden transition-all duration-300">
              <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-transparent via-[var(--primary)] to-transparent opacity-50"></div>
              
              <p className="text-slate-400 font-semibold text-[10px] mb-2 uppercase tracking-[0.2em]">Available Balance</p>
              
              <h2 className="text-6xl font-extrabold mb-3 tracking-tighter text-[var(--primary)] transition-all duration-300">
                {user.points} <span className="text-2xl font-medium text-slate-400 tracking-normal -ml-1">pts</span>
              </h2>
              
              <div className="px-5 py-2 rounded-full bg-slate-50 border border-slate-100 text-slate-600 text-xs font-bold tracking-wide uppercase shadow-inner inline-flex items-center gap-1.5 mt-2">
                <span className="w-2 h-2 rounded-full bg-[var(--primary)] animate-pulse"></span>
                {user.tier} Tier
              </div>
              
              <div className="flex gap-3 w-full mt-8">
                <button 
                  onClick={() => setIsScanning(true)}
                  className="flex-1 py-4 rounded-2xl font-semibold flex items-center justify-center gap-2 shadow-sm border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-all active:scale-[0.98]"
                >
                  <Camera size={18} /> Earn Points
                </button>
                <button 
                  onClick={() => setShowQR(true)}
                  className="flex-1 py-4 rounded-2xl text-white font-semibold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
                  style={{ backgroundColor: 'var(--primary)' }}
                >
                  <QrCode size={18} /> My ID Card
                </button>
              </div>
            </div>

            {/* Quick Stats */}
            <h3 className="font-semibold text-slate-800 text-lg ml-2 mt-8 tracking-tight transition-colors duration-300">Recent Activity</h3>
            <div className="space-y-3">
              {transactions.slice(0, 3).map(tx => {
                const isAddition = tx.type === 'purchase' || tx.type === 'bonus' || tx.type === 'earn_code';
                const isPending = tx.type === 'pending_redemption';
                return (
                  <div key={tx.id} className="bg-white p-4 rounded-[1.5rem] flex items-center justify-between border border-slate-100 shadow-sm transition-all duration-300 hover:bg-slate-50">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-2xl ${isAddition ? 'bg-emerald-50 text-emerald-500' : isPending ? 'bg-amber-50 text-amber-500' : 'bg-rose-50 text-rose-500'}`}>
                        {isAddition ? <Gift size={18} /> : isPending ? <Clock size={18} /> : <Clock size={18} />}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 capitalize tracking-tight">{isPending ? 'Pending Voucher' : tx.type}</p>
                        <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mt-0.5">{new Date(tx.transaction_date).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <span className={`font-bold text-lg tracking-tight ${isAddition ? 'text-emerald-500' : isPending ? 'text-amber-500' : 'text-rose-500'}`}>
                      {isAddition ? '+' : '-'}{Math.abs(parseInt(tx.points))}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'rewards' && (
          <div className="space-y-6">
            <h2 className="text-3xl font-bold text-[var(--primary)] tracking-tight transition-colors duration-300">Rewards</h2>
            
            {/* Active Vouchers Section */}
            {pendingVouchers.length > 0 && (
              <div className="mb-8">
                <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                  Active Vouchers
                </h3>
                <div className="space-y-3">
                  {pendingVouchers.map(voucher => (
                    <div key={voucher.id} onClick={() => setActiveVoucher(voucher)} className="bg-amber-50 p-4 rounded-[1.5rem] flex items-center justify-between border border-amber-200 cursor-pointer hover:bg-amber-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500 text-white rounded-xl">
                          <QrCode size={20} />
                        </div>
                        <div>
                          <p className="font-bold text-amber-900 text-sm">Unredeemed Voucher</p>
                          <p className="text-xs text-amber-700/80 font-medium">Tap to show cashier</p>
                        </div>
                      </div>
                      <span className="font-bold text-amber-700 text-lg">
                        {Math.abs(voucher.points)} pts
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rewards.length === 0 ? (
              <p className="text-slate-500 text-center py-10">No rewards available right now.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {rewards.map(reward => {
                  const canAfford = user.points >= reward.points;
                  const progress = Math.min((user.points / reward.points) * 100, 100);
                  
                  return (
                    <div 
                      key={reward.id} 
                      onClick={() => canAfford && setRewardToClaim(reward)}
                      className={`bg-white rounded-[1.5rem] overflow-hidden shadow-sm border border-slate-100 flex flex-col transition-all duration-300 hover:scale-[1.02] ${canAfford ? 'cursor-pointer ring-2 ring-transparent hover:ring-[var(--primary)]' : 'opacity-80 grayscale-[20%]'}`}
                    >
                      <div className="h-36 bg-slate-50 relative">
                        {reward.image ? (
                          <img src={reward.image} alt={reward.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300 bg-slate-100">
                            <Gift size={40} />
                          </div>
                        )}
                        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-xl text-xs font-bold text-slate-800 shadow-sm border border-white/20">
                          {reward.points} <span className="text-[10px] font-medium text-slate-500">pts</span>
                        </div>
                      </div>
                      <div className="p-4 flex-1 flex flex-col">
                        <h3 className="font-bold text-slate-800 text-sm line-clamp-2 leading-snug flex-1">{reward.title}</h3>
                        
                        <div className="mt-4">
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                            <div 
                              className={`h-full rounded-full transition-all duration-1000 ease-out ${canAfford ? 'bg-[var(--primary)]' : 'bg-slate-300'}`} 
                              style={{ width: `${progress}%` }}
                            ></div>
                          </div>
                          <p className={`text-[10px] mt-2 text-center font-bold tracking-wide uppercase ${canAfford ? 'text-[var(--primary)]' : 'text-slate-400'}`}>
                            {canAfford ? 'Tap to claim!' : `${reward.points - user.points} pts to go`}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-6">
            <h2 className="text-3xl font-bold text-[var(--primary)] tracking-tight transition-colors duration-300">History</h2>
            {transactions.length === 0 ? (
              <p className="text-slate-500 text-center py-10">No transactions yet.</p>
            ) : (
              <div className="space-y-3">
                {transactions.map(tx => {
                  const isAddition = tx.type === 'purchase' || tx.type === 'bonus' || tx.type === 'earn_code';
                  const isPending = tx.type === 'pending_redemption';
                  return (
                    <div key={tx.id} className="bg-white p-4 rounded-[1.5rem] flex items-center justify-between border border-slate-100 shadow-sm transition-all duration-300 hover:bg-slate-50">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-2xl ${isAddition ? 'bg-emerald-50 text-emerald-500' : isPending ? 'bg-amber-50 text-amber-500' : 'bg-rose-50 text-rose-500'}`}>
                          {isAddition ? <Gift size={18} /> : isPending ? <Clock size={18} /> : <Clock size={18} />}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 capitalize tracking-tight">{isPending ? 'Pending Voucher' : tx.type}</p>
                          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mt-0.5">{new Date(tx.transaction_date).toLocaleString()}</p>
                        </div>
                      </div>
                      <span className={`font-bold text-lg tracking-tight ${isAddition ? 'text-emerald-500' : isPending ? 'text-amber-500' : 'text-rose-500'}`}>
                        {isAddition ? '+' : '-'}{Math.abs(parseInt(tx.points))}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="space-y-6">
            <h2 className="text-3xl font-bold text-[var(--primary)] tracking-tight transition-colors duration-300">My Profile</h2>
            
            {/* Tier Progress Card */}
            <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 relative overflow-hidden transition-all duration-300">
              <div className="flex justify-between items-end mb-4">
                <div>
                  <p className="text-slate-400 font-semibold text-[10px] uppercase tracking-[0.2em] mb-1">Current Tier</p>
                  <h3 className="text-2xl font-bold text-[var(--primary)]">{user.tier}</h3>
                </div>
                {nextTierData && (
                  <div className="text-right">
                    <p className="text-slate-400 font-semibold text-[10px] uppercase tracking-[0.2em] mb-1">Next Tier</p>
                    <h3 className="text-lg font-bold text-slate-600" style={{ color: nextTierData.color }}>{tierData.next}</h3>
                  </div>
                )}
              </div>
              
              {nextTierData ? (
                <>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50 mt-2">
                    <div 
                      className="h-full rounded-full transition-all duration-1000 ease-out" 
                      style={{ width: `${progressToNext}%`, backgroundColor: 'var(--primary)' }}
                    ></div>
                  </div>
                  <p className="text-xs text-slate-500 mt-4 font-medium text-center">
                    You are <strong className="text-slate-800">{pointsToNext} pts</strong> away from unlocking {tierData.next} benefits!
                  </p>
                </>
              ) : (
                <div className="text-center py-4 bg-slate-50 rounded-xl mt-4 border border-slate-100">
                  <p className="text-sm font-bold text-slate-600 uppercase tracking-widest">Maximum Tier Reached!</p>
                </div>
              )}
            </div>

            {/* Profile Settings */}
            <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100">
              <h3 className="text-lg font-bold text-slate-800 mb-6">Account Details</h3>
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Display Name</label>
                  <input 
                    type="text" 
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                    style={{ '--tw-ring-color': 'var(--primary)' }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email Address</label>
                  <input 
                    type="email" 
                    value={user.email}
                    disabled
                    className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-slate-500 font-medium cursor-not-allowed"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={isUpdatingProfile || profileName === user.name}
                  className="w-full py-4 rounded-xl text-white font-bold tracking-wide shadow-md hover:shadow-lg transition-all active:scale-[0.98] mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'var(--primary)' }}
                >
                  {isUpdatingProfile ? 'Saving...' : 'Save Changes'}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* Premium Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-100 pb-safe shadow-[0_-10px_40px_rgba(0,0,0,0.03)] z-40 transition-colors duration-300">
        <div className="flex justify-around items-center h-20 px-2 max-w-md mx-auto w-full">
          <button 
            onClick={() => setActiveTab('home')} 
            className={`flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all duration-300 ${activeTab === 'home' ? 'text-[var(--primary)] -translate-y-1' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Home size={22} strokeWidth={activeTab === 'home' ? 2.5 : 2} />
            <span className={`text-[10px] font-bold mt-1 tracking-wide ${activeTab === 'home' ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}>HOME</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('rewards')} 
            className={`flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all duration-300 ${activeTab === 'rewards' ? 'text-[var(--primary)] -translate-y-1' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Gift size={22} strokeWidth={activeTab === 'rewards' ? 2.5 : 2} />
            <span className={`text-[10px] font-bold mt-1 tracking-wide ${activeTab === 'rewards' ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}>REWARDS</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('history')} 
            className={`flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all duration-300 ${activeTab === 'history' ? 'text-[var(--primary)] -translate-y-1' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Clock size={22} strokeWidth={activeTab === 'history' ? 2.5 : 2} />
            <span className={`text-[10px] font-bold mt-1 tracking-wide ${activeTab === 'history' ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}>HISTORY</span>
          </button>

          <button 
            onClick={() => setActiveTab('profile')} 
            className={`flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all duration-300 ${activeTab === 'profile' ? 'text-[var(--primary)] -translate-y-1' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <User size={22} strokeWidth={activeTab === 'profile' ? 2.5 : 2} />
            <span className={`text-[10px] font-bold mt-1 tracking-wide ${activeTab === 'profile' ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}>PROFILE</span>
          </button>
        </div>
      </nav>

      {/* Earn Points QR Scanner Modal */}
      {isScanning && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[60] flex flex-col items-center justify-center p-4 transition-all duration-300">
          <button 
            onClick={() => setIsScanning(false)}
            className="absolute top-6 right-6 p-3 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors"
          >
            <X size={24} />
          </button>
          
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">Scan to Earn</h3>
            <p className="text-slate-300 text-sm font-medium">Scan the QR code on the cashier's screen</p>
          </div>
          
          <div className="w-full max-w-sm rounded-[2rem] overflow-hidden bg-white relative">
            <div id="reader" className="w-full"></div>
            {isProcessingScan && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-10">
                <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-[var(--primary)] animate-spin"></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scan Result Overlay */}
      {scanResult && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={() => setScanResult(null)}>
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm flex flex-col items-center text-center shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className={`w-20 h-20 rounded-full flex items-center justify-center text-white mb-6 shadow-lg ${scanResult.success ? 'bg-emerald-500' : 'bg-rose-500'}`}>
              {scanResult.success ? <Gift size={32} /> : <X size={32} />}
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-3">{scanResult.success ? 'Success!' : 'Oops!'}</h3>
            <p className="text-slate-600 font-medium mb-8 leading-relaxed">{scanResult.message}</p>
            <button 
              onClick={() => setScanResult(null)}
              className="w-full py-4 rounded-2xl font-bold text-white shadow-md transition-all active:scale-[0.98]"
              style={{ backgroundColor: scanResult.success ? '#10b981' : '#f43f5e' }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* QR Code Modal (Member ID) */}
      {showQR && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-300" onClick={() => setShowQR(false)}>
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm flex flex-col items-center text-center shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setShowQR(false)}
              className="absolute top-5 right-5 p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors"
            >
              <X size={20} />
            </button>
            <h3 className="text-2xl font-bold text-slate-800 mb-2 tracking-tight">Digital Card</h3>
            <p className="text-xs text-slate-500 mb-8 uppercase tracking-widest font-medium">Scan at checkout</p>
            
            <div className="p-5 bg-white rounded-3xl border-4 border-slate-100 shadow-sm mb-8">
              <QRCodeSVG value={user.member_code} size={220} level="H" />
            </div>
            
            <div className="bg-slate-50 px-6 py-4 rounded-2xl border border-slate-100 w-full">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mb-1">Member Code</p>
              <p className="text-3xl font-mono tracking-[0.3em] font-bold text-slate-800">{user.member_code}</p>
            </div>
          </div>
        </div>
      )}

      {/* Active Voucher Display Modal */}
      {activeVoucher && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-300" onClick={() => setActiveVoucher(null)}>
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm flex flex-col items-center text-center shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setActiveVoucher(null)}
              className="absolute top-5 right-5 p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors"
            >
              <X size={20} />
            </button>
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-amber-500 bg-amber-100 mb-4 shadow-sm">
              <Gift size={28} />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-1 tracking-tight">Reward Voucher</h3>
            <p className="text-xs text-amber-600 mb-8 font-bold uppercase tracking-widest bg-amber-50 px-3 py-1 rounded-full">Scan to Redeem</p>
            
            <div className="p-5 bg-white rounded-3xl border-4 border-amber-100 shadow-sm mb-6">
              <QRCodeSVG 
                value={JSON.stringify({ action: 'claim', id: activeVoucher.id })} 
                size={220} 
                level="M" 
                fgColor="#0f172a"
              />
            </div>
            
            <p className="text-slate-500 font-medium px-4 text-sm leading-relaxed">
              Show this QR code to the cashier to receive your physical reward.
            </p>
          </div>
        </div>
      )}

      {/* Claim Reward Confirmation Modal */}
      {rewardToClaim && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-300" onClick={() => !isClaiming && setRewardToClaim(null)}>
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm flex flex-col items-center text-center shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-white mb-4 shadow-md" style={{ backgroundColor: 'var(--primary)' }}>
              <Gift size={28} />
            </div>
            
            <h3 className="text-2xl font-bold text-slate-800 mb-2 tracking-tight">Claim Reward?</h3>
            <p className="text-slate-500 mb-6">
              Are you sure you want to spend <span className="font-bold text-slate-700">{rewardToClaim.points} pts</span> to claim <span className="font-bold text-slate-700">{rewardToClaim.title}</span>?
            </p>
            
            <div className="flex w-full gap-3">
              <button 
                onClick={() => setRewardToClaim(null)}
                disabled={isClaiming}
                className="flex-1 py-3.5 rounded-2xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleClaimReward}
                disabled={isClaiming}
                className="flex-1 py-3.5 rounded-2xl font-semibold text-white shadow-md hover:shadow-lg transition-all active:scale-[0.98] disabled:opacity-50"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                {isClaiming ? 'Claiming...' : 'Yes, Claim it!'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
