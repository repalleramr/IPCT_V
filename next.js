import { NextResponse } from 'next/server';

// Deploying on Vercel Edge Runtime for sub-millisecond execution closer to users
export const runtime = 'edge';

interface BallData {
  runs: number;
  isBoundary: boolean;
  isWicket: boolean;
  ballSpeedKmph: number;
  expectedSpeedKmph: number;
  pitchDeviationCm: number; // Distance from target execution (e.g., missing a yorker)
}

interface PredictionRequest {
  recentBalls: BallData[]; // The last 12-18 balls bowled in the match
  baseExpectedRunRate: number; // Static historical average baseline
  wicketsLeft: number;
  ballsRemaining: number;
}

export async function POST(request: Request) {
  try {
    const body: PredictionRequest = await request.json();
    const { recentBalls, baseExpectedRunRate, wicketsLeft, ballsRemaining } = body;

    if (!recentBalls || recentBalls.length === 0) {
      return NextResponse.json({ error: 'Incomplete match context provided.' }, { status: 400 });
    }

    // 1. Calculate Batter Momentum via Exponential Decay
    // More recent balls heavily overpower older balls in the sequence
    let totalBatterWeight = 0;
    let weightedBatterScore = 0;
    
    // 2. Calculate Bowler Fatigue / Execution Failure
    let totalBowlerWeight = 0;
    let weightedBowlerDeviation = 0;

    recentBalls.forEach((ball, index) => {
      // Exponential weight: index 0 (oldest) gets lowest weight, last element (newest) gets highest
      const recencyWeight = Math.pow(1.3, index); 

      // Batter factor: boundaries and high scoring options scale momentum exponentially
      const batterPerformance = ball.runs * (ball.isBoundary ? 1.5 : 1.0);
      weightedBatterScore += batterPerformance * recencyWeight;
      totalBatterWeight += recencyWeight;

      // Bowler factor: Tracking speed drops and pitch misses (length errors)
      const speedDrop = Math.max(0, ball.expectedSpeedKmph - ball.ballSpeedKmph);
      const bowlerError = speedDrop + (ball.pitchDeviationCm / 10); // Normalizing units
      weightedBowlerDeviation += bowlerError * recencyWeight;
      totalBowlerWeight += recencyWeight;
    });

    const batterMomentumFactor = weightedBatterScore / totalBatterWeight;
    const bowlerDegradationFactor = weightedBowlerDeviation / totalBowlerWeight;

    // 3. Situational Accelerators (Context Weights)
    const wicketRiskPenalty = Math.max(0.3, wicketsLeft / 10); // Fewer wickets = lower risk tolerance
    const deathOverUrgency = ballsRemaining <= 30 ? 1.6 : 1.0; // Hard trigger for the last 5 overs

    // 4. Compute Dynamic Projected Run Rate (The Core Pattern Synthesis)
    // We adjust the baseline stat up or down depending on the live momentum variables
    const dynamicRunRateAdjustment = 
      (batterMomentumFactor * 1.4) + 
      (bowlerDegradationFactor * 0.8) * wicketRiskPenalty * deathOverUrgency;

    const livePredictedRunRate = Math.max(
      baseExpectedRunRate * 0.5, // Floor value so prediction doesn't hit 0
      baseExpectedRunRate + dynamicRunRateAdjustment
    );
// live.js - The Data Ingestion and API Linkage

// 1. Maintain a rolling memory of the most recent deliveries
let recentBallsMemory = [];
const MAX_MEMORY_LENGTH = 18; // We only need the last 3 overs to detect immediate patterns

/**
 * This function triggers the moment a new ball is bowled.
 * (You would link this to your WebSocket or Live Polling API)
 */
function onNewBallBowled(liveBallData) {
  // Add the newest ball to our memory array
  recentBallsMemory.push(liveBallData);
  
  // Keep the array limited to the last 18 balls to prevent data bloat
  if (recentBallsMemory.length > MAX_MEMORY_LENGTH) {
    recentBallsMemory.shift(); // Removes the oldest ball
  }

  // Immediately ask the AI for a new prediction
  fetchLivePrediction();
}

/**
 * THE LINK: This sends the live data to our Vercel API route
 */
async function fetchLivePrediction() {
  // Construct the payload required by our Next.js Edge route
  const payload = {
    recentBalls: recentBallsMemory,
    baseExpectedRunRate: 8.5, // Your historical baseline
    wicketsLeft: 7,           // Update dynamically
    ballsRemaining: 30        // Update dynamically
  };

  try {
    // Calling the Next.js API Route we built earlier
    const response = await fetch('/api/predict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error('API linkage failed');

    const aiData = await response.json();

    if (aiData.success) {
      updateDashboard(aiData);
    }

  } catch (error) {
    console.error("Live sync error: Could not reach the prediction API.", error);
  }
}

/**
 * Updates your User Interface with the AI's real-time calculations
 */
function updateDashboard(aiData) {
  const { livePredictedRunRate } = aiData.analytics;
  const { projectedRunsInRemainingBalls, explanation } = aiData.projection;

  console.log(`🔥 AI UPDATE: New Projected Run Rate is ${livePredictedRunRate}`);
  console.log(`🎯 Projected Runs Off Remaining Balls: ${projectedRunsInRemainingBalls}`);
  console.log(`🧠 AI Logic: ${explanation}`);
  
  // Here you would target your DOM elements, e.g.:
  // document.getElementById('projected-score').innerText = projectedRunsInRemainingBalls;
}

// --- SIMULATION TEST ---
// Simulating a live ball coming in from a match feed
setTimeout(() => {
  const simulatedBallData = {
    runs: 4,
    isBoundary: true,
    isWicket: false,
    ballSpeedKmph: 135,
    expectedSpeedKmph: 140, // Bowler dropped pace
    pitchDeviationCm: 45    // Missed the length
  };
  
  onNewBallBowled(simulatedBallData);
}, 2000);
    
    // Calculate final projected score for the remaining balls
    const projectedRunsInRemainingBalls = Math.round((livePredictedRunRate / 6) * ballsRemaining);

    return NextResponse.json({
      success: true,
      analytics: {
        batterMomentumFactor: parseFloat(batterMomentumFactor.toFixed(2)),
        bowlerDegradationFactor: parseFloat(bowlerDegradationFactor.toFixed(2)),
        livePredictedRunRate: parseFloat(livePredictedRunRate.toFixed(2)),
      },
      projection: {
        projectedRunsInRemainingBalls,
        explanation: livePredictedRunRate > baseExpectedRunRate * 1.5 
          ? "High probability of explosive scoring detected. Bowler fatigue aligns with aggressive batting patterns."
          : "Stable pattern. Scoring rate matches historical baseline closely."
      }
    });

  } catch (error) {
    return NextResponse.json({ error: 'Failed to process match data stream.' }, { status: 500 });
  }
}
