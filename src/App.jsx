import { useState, useEffect } from 'react';
import { db } from './firebase';
import { ref, onValue, push, remove, update, query, orderByChild, get } from 'firebase/database';
import './App.css';

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}時${m}分`;
}

function formatTimeValue(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  return `${Number(h)}時${m}分`;
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${h}:${m}`;
}

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

const CORRECT_PIN = '5050';
const ADMIN_PIN = '505050';

function App() {
  const [tab, setTab] = useState('here');
  const [name, setName] = useState('');
  const [memo, setMemo] = useState('');
  const [untilTime, setUntilTime] = useState('');
  const [fromTime, setFromTime] = useState('');
  const [toTime, setToTime] = useState('');
  const [members, setMembers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('pin') === CORRECT_PIN);
  const [pin, setPin] = useState('');
  const [isAdmin, setIsAdmin] = useState(() => sessionStorage.getItem('admin') === 'true');
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logError, setLogError] = useState('');

  const hereMembers = members.filter((m) => m.status !== 'coming');
  const comingMembers = members.filter((m) => m.status === 'coming');

  useEffect(() => {
    const membersRef = query(ref(db, 'members'), orderByChild('checkedInAt'));
    const unsubscribe = onValue(membersRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setMembers([]);
        return;
      }
      const list = Object.entries(data).map(([id, value]) => ({
        id,
        ...value,
      }));
      list.sort((a, b) => a.checkedInAt - b.checkedInAt);
      setMembers(list);
    });
    return () => unsubscribe();
  }, []);

  const cleanOldLogs = async () => {
    const cutoff = Date.now() - THIRTY_DAYS;
    const logsRef = ref(db, 'logs');
    const snapshot = await get(logsRef);
    if (!snapshot.exists()) return;
    const data = snapshot.val();
    const deletePromises = Object.entries(data)
      .filter(([, v]) => v.timestamp < cutoff)
      .map(([id]) => remove(ref(db, `logs/${id}`)));
    await Promise.all(deletePromises);
  };

  const addLog = async (name, action) => {
    try {
      await push(ref(db, 'logs'), {
        name,
        action,
        timestamp: Date.now(),
      });
    } catch (e) {
      console.error('ログ書き込みエラー:', e);
    }
  };

  const loadLogs = async () => {
    setLogError('');
    try {
      await cleanOldLogs();
    } catch (e) {
      // ignore cleanup errors
    }
    try {
      const snapshot = await get(ref(db, 'logs'));
      if (!snapshot.exists()) {
        setLogs([]);
        return;
      }
      const data = snapshot.val();
      const list = Object.entries(data)
        .map(([id, value]) => ({ id, ...value }))
        .sort((a, b) => b.timestamp - a.timestamp);
      setLogs(list);
    } catch (e) {
      console.error('ログ読み込みエラー:', e);
      setLogError(e.message || 'ログの読み込みに失敗しました');
      setLogs([]);
    }
  };

  const resetForm = () => {
    setName('');
    setMemo('');
    setUntilTime('');
    setFromTime('');
    setToTime('');
    setError('');
  };

  const handleCheckIn = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('名前を入力してください');
      return;
    }
    const duplicate = members.find(
      (m) => m.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      setError('同じ名前の人がすでに登録されています');
      return;
    }
    setError('');

    if (tab === 'here') {
      const entry = {
        name: trimmed,
        checkedInAt: Date.now(),
        status: 'here',
      };
      if (untilTime) entry.untilTime = untilTime;
      const trimmedMemo = memo.trim();
      if (trimmedMemo) entry.memo = trimmedMemo;
      await push(ref(db, 'members'), entry);
      await addLog(trimmed, 'in');
    } else {
      const entry = {
        name: trimmed,
        checkedInAt: Date.now(),
        status: 'coming',
      };
      if (fromTime) entry.fromTime = fromTime;
      if (toTime) entry.toTime = toTime;
      const trimmedMemo = memo.trim();
      if (trimmedMemo) entry.memo = trimmedMemo;
      await push(ref(db, 'members'), entry);
      await addLog(trimmed, 'coming');
    }
    resetForm();
  };

  const handleArrival = async (id) => {
    const member = members.find((m) => m.id === id);
    if (!member) return;
    const updates = {
      status: 'here',
      checkedInAt: Date.now(),
    };
    // fromTime/toTime はもう不要なので削除、untilTime に toTime を引き継ぐ
    if (member.toTime) {
      updates.untilTime = member.toTime;
    }
    // fromTime, toTime を消す
    updates.fromTime = null;
    updates.toTime = null;
    await update(ref(db, `members/${id}`), updates);
    await addLog(member.name, 'in');
    setSelectedId(null);
  };

  const handleCheckOut = async (id) => {
    const member = members.find((m) => m.id === id);
    await remove(ref(db, `members/${id}`));
    if (member) {
      await addLog(member.name, 'out');
    }
    setSelectedId(null);
  };

  const handleUnlock = () => {
    if (pin === ADMIN_PIN) {
      sessionStorage.setItem('pin', CORRECT_PIN);
      sessionStorage.setItem('admin', 'true');
      setUnlocked(true);
      setIsAdmin(true);
      setPin('');
      setError('');
    } else if (pin === CORRECT_PIN) {
      sessionStorage.setItem('pin', pin);
      setUnlocked(true);
      setPin('');
      setError('');
    } else {
      setError('PINが違います');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (!unlocked) {
        handleUnlock();
      } else {
        handleCheckIn();
      }
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>モルックドーム</h1>
        <p className="subtitle">在室確認</p>
        <p className="description">
          PINを入力するとチェックイン・チェックアウトができます。
          <br />
          一度入力すればブラウザを閉じるまで有効です。
        </p>
        <p className="home-tip">
          <strong>ホーム画面に追加</strong>するとアプリのように使えます。
          <br />
          iPhone：共有ボタン →「ホーム画面に追加」
          <br />
          Android：メニュー（︙）→「ホーム画面に追加」
        </p>
      </header>

      <section className="checkin-section">
        {!unlocked ? (
          <>
            <div className="input-group">
              <input
                type="password"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError('');
                }}
                onKeyDown={handleKeyDown}
                placeholder="PINを入力"
                className="name-input"
                maxLength={10}
                inputMode="numeric"
              />
              <button onClick={handleUnlock} className="checkin-btn">
                解除
              </button>
            </div>
            {error && <p className="error-msg">{error}</p>}
          </>
        ) : (
          <>
            <div className="tab-group">
              <button
                className={`tab-btn ${tab === 'here' ? 'tab-active' : ''}`}
                onClick={() => { setTab('here'); setError(''); }}
              >
                今いるよ！
              </button>
              <button
                className={`tab-btn ${tab === 'coming' ? 'tab-active' : ''}`}
                onClick={() => { setTab('coming'); setError(''); }}
              >
                あとで行くよ
              </button>
            </div>

            <div className="input-group">
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                onKeyDown={handleKeyDown}
                placeholder="名前を入力"
                className="name-input"
                maxLength={20}
              />
              <button onClick={handleCheckIn} className="checkin-btn">
                {tab === 'here' ? 'チェックイン' : '登録'}
              </button>
            </div>

            {tab === 'here' ? (
              <div className="time-row">
                <label className="time-label">滞在予定</label>
                <span className="time-sep">〜</span>
                <input
                  type="time"
                  value={untilTime}
                  onChange={(e) => setUntilTime(e.target.value)}
                  className="time-input"
                />
                <span className="time-hint">まで（任意）</span>
              </div>
            ) : (
              <div className="time-row">
                <label className="time-label">予定</label>
                <input
                  type="time"
                  value={fromTime}
                  onChange={(e) => setFromTime(e.target.value)}
                  className="time-input"
                />
                <span className="time-sep">〜</span>
                <input
                  type="time"
                  value={toTime}
                  onChange={(e) => setToTime(e.target.value)}
                  className="time-input"
                />
                <span className="time-hint">（任意）</span>
              </div>
            )}

            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="一言メモ（任意）"
              className="memo-input"
              maxLength={50}
            />
            {error && <p className="error-msg">{error}</p>}
          </>
        )}
      </section>

      <section className="members-section">
        <h2 className="members-title">
          現在いる人 <span className="count">{hereMembers.length}人</span>
        </h2>

        {hereMembers.length === 0 ? (
          <div className="empty-state">
            <p>今は誰もいません</p>
          </div>
        ) : (
          <ul className="members-list">
            {hereMembers.map((member) => (
              <li
                key={member.id}
                className={`member-item ${unlocked && selectedId === member.id ? 'selected' : ''}`}
                onClick={() =>
                  unlocked && setSelectedId(selectedId === member.id ? null : member.id)
                }
              >
                <div className="member-info">
                  <span className="member-name">{member.name}</span>
                  {member.memo && (
                    <span className="member-memo">「{member.memo}」</span>
                  )}
                  <span className="member-time">
                    {formatTime(member.checkedInAt)}から滞在中
                    {member.untilTime && `（〜${formatTimeValue(member.untilTime)}予定）`}
                  </span>
                </div>
                {unlocked && selectedId === member.id && (
                  <button
                    className="checkout-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCheckOut(member.id);
                    }}
                  >
                    帰る
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="members-section coming-section">
        <h2 className="members-title">
          あとで来る人 <span className="count count-coming">{comingMembers.length}人</span>
        </h2>

        {comingMembers.length === 0 ? (
          <div className="empty-state">
            <p>予定なし</p>
          </div>
        ) : (
          <ul className="members-list">
            {comingMembers.map((member) => (
              <li
                key={member.id}
                className={`member-item ${unlocked && selectedId === member.id ? 'selected' : ''}`}
                onClick={() =>
                  unlocked && setSelectedId(selectedId === member.id ? null : member.id)
                }
              >
                <div className="member-info">
                  <span className="member-name">{member.name}</span>
                  {member.memo && (
                    <span className="member-memo">「{member.memo}」</span>
                  )}
                  <span className="member-time">
                    {member.fromTime || member.toTime ? (
                      <>
                        {member.fromTime ? formatTimeValue(member.fromTime) : ''}
                        {member.fromTime && member.toTime ? '〜' : ''}
                        {member.toTime ? formatTimeValue(member.toTime) : ''}
                        {' 予定'}
                      </>
                    ) : (
                      '来る予定'
                    )}
                  </span>
                </div>
                {unlocked && selectedId === member.id && (
                  <div className="action-buttons">
                    <button
                      className="arrival-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleArrival(member.id);
                      }}
                    >
                      到着！
                    </button>
                    <button
                      className="checkout-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCheckOut(member.id);
                      }}
                    >
                      取消
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isAdmin && (
        <section className="logs-section">
          <button
            className="logs-toggle-btn"
            onClick={() => {
              if (!showLogs) loadLogs();
              setShowLogs(!showLogs);
            }}
          >
            {showLogs ? '履歴を閉じる' : '利用履歴'}
          </button>
          {showLogs && (
            <div className="logs-list">
              {logError ? (
                <p className="error-msg">{logError}</p>
              ) : logs.length === 0 ? (
                <p className="logs-empty">履歴はありません</p>
              ) : (
                <ul>
                  {logs.map((log) => (
                    <li key={log.id} className="log-item">
                      <span className={`log-action ${log.action === 'in' ? 'log-in' : log.action === 'coming' ? 'log-coming' : 'log-out'}`}>
                        {log.action === 'in' ? 'IN' : log.action === 'coming' ? '予定' : 'OUT'}
                      </span>
                      <span className="log-name">{log.name}</span>
                      <span className="log-time">{formatDate(log.timestamp)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      <footer className="footer">
        <p className="footer-url">
          このページのURL
          <br />
          <a href="https://molkky-dome-check.vercel.app">molkky-dome-check.vercel.app</a>
        </p>
      </footer>
    </div>
  );
}

export default App;
