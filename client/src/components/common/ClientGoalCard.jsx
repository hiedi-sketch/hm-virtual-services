import { useState } from 'react';
import axios from 'axios';

export default function ClientGoalCard({ current, goal, onGoalUpdate }) {
  const [editing, setEditing] = useState(false);
  const [newGoal, setNewGoal] = useState(goal);

  const percentage = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;

  const barColor = percentage >= 100 ? 'bg-green-500' :
                   percentage >= 75  ? 'bg-teal-500' :
                   percentage >= 50  ? 'bg-yellow-400' :
                   'bg-red-400';

  const handleSave = async () => {
    await axios.put('/api/settings/goals', { active_clients_goal: newGoal });
    onGoalUpdate(newGoal);
    setEditing(false);
  };

  return (
    <div className="card">
      <div className="flex justify-between items-center mb-2">
        <h2 className="font-bold text-primary">Active Client Goal</h2>
        <button
          onClick={() => setEditing(!editing)}
          className="text-xs text-black hover:text-primary transition"
        >
          {editing ? 'Cancel' : '✏️ Edit Goal'}
        </button>
      </div>

      {editing ? (
        <div className="flex gap-2 mb-4">
          <input
            type="number"
            value={newGoal}
            onChange={e => setNewGoal(Number(e.target.value))}
            className="border rounded px-2 py-1 w-24 text-sm"
          />
          <button
            onClick={handleSave}
            className="bg-primary text-white text-sm px-3 py-1 rounded hover:bg-accent transition"
          >
            Save
          </button>
        </div>
      ) : (
        <p className="text-sm text-black mb-4">Goal: {goal} clients</p>
      )}

      <div className="text-5xl font-bold text-center text-primary mb-4">
        {current} <span className="text-black text-2xl">/ {goal}</span>
      </div>

      <div className="w-full bg-gray-300 rounded-full h-4 mb-2">
        <div
          className={`${barColor} h-4 rounded-full transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <p className="text-xs text-center text-black">{Math.round(percentage)}% of goal reached</p>
    </div>
  );
}