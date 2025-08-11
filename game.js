'use strict';

class AdvancedTrainSimulator {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.gameState = 'loading';
        this.loadingProgress = 0;
        this.startTime = Date.now();
        this.isMuted = false;
        this.currentView = 'cockpit';
        
        this.init();
    }
    
    async init() {
        await this.setupCanvas();
        this.setupAudio();
        this.setupGameData();
        this.setupUI();
        this.setupEventListeners();
        this.startLoadingSequence();
        this.gameLoop();
    }
    
    async setupCanvas() {
        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        
        const resizeCanvas = () => {
            this.canvas.width = Math.floor(window.innerWidth * dpr);
            this.canvas.height = Math.floor(window.innerHeight * dpr);
            this.canvas.style.width = window.innerWidth + 'px';
            this.canvas.style.height = window.innerHeight + 'px';
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            this.ctx.imageSmoothingEnabled = true;
            this.ctx.imageSmoothingQuality = 'high';
        };
        
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    }
    
    setupAudio() {
        this.audioContext = null;
        this.hornSound = null;
        this.engineSound = null;
        
        document.addEventListener('click', () => {
            if (!this.audioContext) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                this.audioContext = new AudioContext();
            }
        }, { once: true });
    }
    
    setupGameData() {
        this.routeStations = [
            { name: 'Mumbai CSMT', km: 0, passengers: { board: 150, alight: 0 } },
            { name: 'Dadar', km: 9.01, passengers: { board: 200, alight: 50 } },
            { name: 'Thane', km: 34.0, passengers: { board: 180, alight: 120 } },
            { name: 'Kalyan Jn', km: 51.2, passengers: { board: 160, alight: 100 } },
            { name: 'Karjat', km: 76.86, passengers: { board: 140, alight: 80 } },
            { name: 'Lonavala', km: 104.69, passengers: { board: 120, alight: 90 } },
            { name: 'Shivajinagar', km: 165.93, passengers: { board: 100, alight: 80 } },
            { name: 'Pune Jn', km: 168.37, passengers: { board: 0, alight: 200 } }
        ];
        
        this.totalDistance = this.routeStations[this.routeStations.length - 1].km;
        
        this.generateLevelCrossings();
        this.generateSignals();
        
        this.train = {
            positionKm: 0,
            speedKmh: 0,
            targetSpeed: 0,
            throttle: 0,
            brake: 0,
            passengers: 120,
            capacity: 900,
            dwellRemainingS: 0,
            atStationIndex: 0,
            horn: false,
            headlights: true,
            emergencyBrake: false,
            
            physics: {
                acceleration: 0,
                momentum: 0,
                traction: 1.0,
                weight: 350000,
                maxTractionForce: 280000,
                aerodynamicDrag: 0.6,
                rollingResistance: 0.008
            },
            
            performance: {
                score: 1000,
                onTimeBonus: 0,
                safetyViolations: 0,
                passengerComfort: 1.0
            }
        };
        
        this.gameConstants = {
            MAX_SPEED_KMH: 200,
            STATION_SPEED_LIMIT: 40,
            YELLOW_SIGNAL_LIMIT: 60,
            EMERGENCY_BRAKE_RATE: 5.0,
            NORMAL_BRAKE_RATE: 2.5,
            THROTTLE_RESPONSE: 1.5,
            DWELL_TIME_RANGE: [25, 45]
        };
        
        this.environment = {
            weather: 'clear',
            timeOfDay: 'day',
            visibility: 1.0,
            trackCondition: 'good',
            bgOffset: 0,
            parallaxLayers: []
        };
        
        this.camera = {
            x: 0,
            y: 0,
            zoom: 1.0,
            shake: 0,
            targetShake: 0
        };
        
        this.particleSystem = {
            particles: [],
            maxParticles: 100
        };
    }
    
    generateLevelCrossings() {
        this.levelCrossings = [];
        const minGap = 20;
        let pos = 25;
        
        while (pos < this.totalDistance - 15) {
            const nearStation = this.routeStations.some(s => Math.abs(s.km - pos) < 5);
            if (!nearStation) {
                this.levelCrossings.push({
                    km: pos,
                    type: Math.random() > 0.7 ? 'automatic' : 'manual',
                    warning: false
                });
            }
            pos += minGap + Math.random() * 20;
        }
    }
    
    generateSignals() {
        this.signals = [];
        let pos = 15;
        
        while (pos < this.totalDistance - 8) {
            const aspectRoll = Math.random();
            let aspect = 'green';
            
            if (aspectRoll < 0.05) aspect = 'red';
            else if (aspectRoll < 0.15) aspect = 'yellow';
            
            const nearStation = this.routeStations.some(s => Math.abs(s.km - pos) < 4);
            if (nearStation && aspect === 'red') aspect = 'yellow';
            
            this.signals.push({
                km: pos,
                aspect: aspect,
                distance: 0,
                type: 'automatic'
            });
            
            pos += 18 + Math.random() * 15;
        }
    }
    
    setupUI() {
        this.ui = {
            speedValue: document.getElementById('speedValue'),
            throttleValue: document.getElementById('throttleValue'),
            throttleBar: document.getElementById('throttleBar'),
            brakeValue: document.getElementById('brakeValue'),
            brakeBar: document.getElementById('brakeBar'),
            passengersValue: document.getElementById('passengersValue'),
            capacityValue: document.getElementById('capacityValue'),
            currentStation: document.getElementById('currentStation'),
            nextStation: document.getElementById('nextStation'),
            nextStationDistance: document.getElementById('nextStationDistance'),
            signalAspect: document.getElementById('signalAspect'),
            signalLight: document.getElementById('signalLight'),
            ruleHint: document.getElementById('ruleHint'),
            routeProgress: document.getElementById('routeProgress'),
            totalDistance: document.getElementById('totalDistance'),
            systemMessage: document.getElementById('systemMessage'),
            
            speedNeedle: document.getElementById('speedNeedle'),
            digitalSpeed: document.getElementById('digitalSpeed'),
            
            gameOverlay: document.getElementById('gameOverlay'),
            overlayTitle: document.getElementById('overlayTitle'),
            overlayMessage: document.getElementById('overlayMessage'),
            finalTime: document.getElementById('finalTime'),
            finalPassengers: document.getElementById('finalPassengers'),
            finalScore: document.getElementById('finalScore'),
            
            loadingScreen: document.getElementById('loadingScreen'),
            
            muteBtn: document.getElementById('muteBtn')
        };
        
        this.ui.totalDistance.textContent = this.totalDistance.toFixed(1);
        this.ui.capacityValue.textContent = this.train.capacity;
    }
    
    setupEventListeners() {
        this.keys = {
            throttleUp: false,
            throttleDown: false,
            brake: false,
            horn: false,
            emergencyBrake: false
        };
        
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
        // Button controls with proper functionality
        const throttleUpBtn = document.getElementById('throttleUp');
        const throttleDownBtn = document.getElementById('throttleDown');
        const brakeBtn = document.getElementById('brakeBtn');
        const hornBtn = document.getElementById('hornBtn');
        const viewButtons = document.querySelectorAll('.view-btn');
        
        // Throttle controls with smooth response
        throttleUpBtn.addEventListener('mousedown', () => this.startThrottleUp());
        throttleUpBtn.addEventListener('mouseup', () => this.stopThrottleUp());
        throttleUpBtn.addEventListener('mouseleave', () => this.stopThrottleUp());
        throttleUpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.startThrottleUp(); });
        throttleUpBtn.addEventListener('touchend', (e) => { e.preventDefault(); this.stopThrottleUp(); });
        
        throttleDownBtn.addEventListener('mousedown', () => this.startThrottleDown());
        throttleDownBtn.addEventListener('mouseup', () => this.stopThrottleDown());
        throttleDownBtn.addEventListener('mouseleave', () => this.stopThrottleDown());
        throttleDownBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.startThrottleDown(); });
        throttleDownBtn.addEventListener('touchend', (e) => { e.preventDefault(); this.stopThrottleDown(); });
        
        // Brake control with visual feedback
        brakeBtn.addEventListener('mousedown', () => this.startBrake());
        brakeBtn.addEventListener('mouseup', () => this.stopBrake());
        brakeBtn.addEventListener('mouseleave', () => this.stopBrake());
        brakeBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.startBrake(); });
        brakeBtn.addEventListener('touchend', (e) => { e.preventDefault(); this.stopBrake(); });
        
        // Horn control
        hornBtn.addEventListener('click', () => this.playHorn());
        hornBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.playHorn(); });
        
        // View controls
        viewButtons.forEach(btn => {
            btn.addEventListener('click', (e) => this.changeView(e.target.closest('.view-btn')));
        });
        
        // Overlay controls
        document.getElementById('restartBtn').addEventListener('click', () => this.restartGame());
        document.getElementById('resumeBtn').addEventListener('click', () => this.resumeGame());
        
        // Audio toggle
        this.ui.muteBtn.addEventListener('click', () => this.toggleMute());
        
        // Prevent context menu on game canvas
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    
    startThrottleUp() {
        this.keys.throttleUp = true;
        this.addButtonPressEffect('throttleUp');
    }
    
    stopThrottleUp() {
        this.keys.throttleUp = false;
        this.removeButtonPressEffect('throttleUp');
    }
    
    startThrottleDown() {
        this.keys.throttleDown = true;
        this.addButtonPressEffect('throttleDown');
    }
    
    stopThrottleDown() {
        this.keys.throttleDown = false;
        this.removeButtonPressEffect('throttleDown');
    }
    
    startBrake() {
        this.keys.brake = true;
        this.train.emergencyBrake = true;
        this.addButtonPressEffect('brakeBtn');
        document.getElementById('brakeBtn').style.background = 'linear-gradient(145deg, #ff4757, #cc3644)';
    }
    
    stopBrake() {
        this.keys.brake = false;
        this.train.emergencyBrake = false;
        this.removeButtonPressEffect('brakeBtn');
        document.getElementById('brakeBtn').style.background = '';
    }
    
    addButtonPressEffect(buttonId) {
        const btn = document.getElementById(buttonId);
        btn.style.transform = 'translateZ(1px) scale(0.95)';
        btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
    }
    
    removeButtonPressEffect(buttonId) {
        const btn = document.getElementById(buttonId);
        btn.style.transform = '';
        btn.style.boxShadow = '';
    }
    
    changeView(button) {
        document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        this.currentView = button.textContent.toLowerCase();
        
        // Add view change animation
        this.camera.shake = 5;
        this.showSystemMessage(`View changed to ${this.currentView.toUpperCase()}`, 'info');
    }
    
    toggleMute() {
        this.isMuted = !this.isMuted;
        const icon = this.ui.muteBtn.querySelector('.audio-icon');
        icon.textContent = this.isMuted ? '🔇' : '🔊';
        
        if (this.audioContext) {
            this.audioContext.suspend();
            if (!this.isMuted) {
                this.audioContext.resume();
            }
        }
    }
    
    handleKeyDown(e) {
        switch (e.code) {
            case 'ArrowUp':
            case 'KeyW':
                e.preventDefault();
                if (!this.keys.throttleUp) this.startThrottleUp();
                break;
            case 'ArrowDown':
            case 'KeyS':
                e.preventDefault();
                if (!this.keys.throttleDown) this.startThrottleDown();
                break;
            case 'KeyB':
            case 'Space':
                e.preventDefault();
                if (!this.keys.brake) this.startBrake();
                break;
            case 'KeyH':
                e.preventDefault();
                if (!this.keys.horn) {
                    this.keys.horn = true;
                    this.playHorn();
                }
                break;
            case 'KeyM':
                e.preventDefault();
                this.toggleMute();
                break;
            case 'KeyP':
                e.preventDefault();
                this.togglePause();
                break;
        }
    }
    
    handleKeyUp(e) {
        switch (e.code) {
            case 'ArrowUp':
            case 'KeyW':
                this.stopThrottleUp();
                break;
            case 'ArrowDown':
            case 'KeyS':
                this.stopThrottleDown();
                break;
            case 'KeyB':
            case 'Space':
                this.stopBrake();
                break;
            case 'KeyH':
                this.keys.horn = false;
                break;
        }
    }
    
    startLoadingSequence() {
        this.gameState = 'loading';
        
        const loadingInterval = setInterval(() => {
            this.loadingProgress += Math.random() * 15 + 5;
            
            if (this.loadingProgress >= 100) {
                this.loadingProgress = 100;
                clearInterval(loadingInterval);
                
                setTimeout(() => {
                    this.ui.loadingScreen.style.display = 'none';
                    this.gameState = 'playing';
                    console.log('Game started - canvas size:', this.canvas.width, this.canvas.height);
                    // Force initial render
                    this.render();
                    this.showSystemMessage('Welcome to Advanced Train Simulator! Use WASD or buttons to control.', 'success');
                }, 500);
            }
        }, 100);
    }
    
    playHorn(duration = 1200) {
        if (!this.audioContext || this.isMuted) return;
        
        const now = this.audioContext.currentTime;
        
        // Create realistic train horn sound
        const osc1 = this.audioContext.createOscillator();
        const osc2 = this.audioContext.createOscillator();
        const osc3 = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();
        
        osc1.type = 'sawtooth';
        osc2.type = 'triangle';
        osc3.type = 'sine';
        
        // Frequency modulation for realistic horn sound
        osc1.frequency.setValueAtTime(220, now);
        osc1.frequency.exponentialRampToValueAtTime(180, now + duration / 1000);
        
        osc2.frequency.setValueAtTime(330, now);
        osc2.frequency.exponentialRampToValueAtTime(270, now + duration / 1000);
        
        osc3.frequency.setValueAtTime(440, now);
        osc3.frequency.exponentialRampToValueAtTime(360, now + duration / 1000);
        
        // Filter setup
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, now);
        filter.Q.setValueAtTime(2, now);
        
        // Envelope
        gain.gain.setValueAtTime(0, now);
        gain.gain.exponentialRampToValueAtTime(0.3, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.2, now + duration / 1000 - 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration / 1000);
        
        // Connect nodes
        osc1.connect(gain);
        osc2.connect(gain);
        osc3.connect(gain);
        gain.connect(filter);
        filter.connect(this.audioContext.destination);
        
        // Start and stop
        osc1.start(now);
        osc2.start(now);
        osc3.start(now);
        
        osc1.stop(now + duration / 1000);
        osc2.stop(now + duration / 1000);
        osc3.stop(now + duration / 1000);
        
        // Visual feedback
        this.train.horn = true;
        setTimeout(() => this.train.horn = false, duration);
        this.showSystemMessage('🚂 Horn activated', 'info', 1000);
    }
    
    showSystemMessage(text, type = 'info', duration = 3000) {
        const messageEl = this.ui.systemMessage;
        const textEl = messageEl.querySelector('.message-text');
        const iconEl = messageEl.querySelector('.message-icon');
        
        textEl.textContent = text;
        
        // Set icon based on type
        const icons = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        };
        iconEl.textContent = icons[type] || icons.info;
        
        messageEl.classList.remove('hidden');
        messageEl.classList.add('show');
        
        // Auto hide after duration
        setTimeout(() => {
            messageEl.classList.remove('show');
            setTimeout(() => messageEl.classList.add('hidden'), 500);
        }, duration);
    }
    
    updatePhysics(deltaTime) {
        if (this.gameState !== 'playing') return;
        
        // Enhanced train physics
        const train = this.train;
        const physics = train.physics;
        const dt = deltaTime;
        
        // Throttle and brake input processing
        if (this.keys.throttleUp) {
            train.throttle = Math.min(1.0, train.throttle + this.gameConstants.THROTTLE_RESPONSE * dt);
        }
        if (this.keys.throttleDown) {
            train.throttle = Math.max(0.0, train.throttle - this.gameConstants.THROTTLE_RESPONSE * dt);
        }
        
        if (this.keys.brake || train.emergencyBrake) {
            const brakeRate = train.emergencyBrake ? 
                this.gameConstants.EMERGENCY_BRAKE_RATE : 
                this.gameConstants.NORMAL_BRAKE_RATE;
            train.brake = Math.min(1.0, train.brake + brakeRate * dt);
        } else {
            train.brake = Math.max(0.0, train.brake - 2.0 * dt);
        }
        
        // Speed limits and restrictions
        const stationContext = this.getStationContext(train.positionKm);
        const upcomingSignal = this.getUpcomingSignal(train.positionKm);
        let speedLimit = this.gameConstants.MAX_SPEED_KMH;
        
        // Station speed limit
        const inStationArea = this.isInStationArea(train.positionKm, stationContext.next.km);
        if (inStationArea) {
            speedLimit = Math.min(speedLimit, this.gameConstants.STATION_SPEED_LIMIT);
        }
        
        // Signal restrictions
        if (upcomingSignal) {
            if (upcomingSignal.aspect === 'yellow') {
                speedLimit = Math.min(speedLimit, this.gameConstants.YELLOW_SIGNAL_LIMIT);
            } else if (upcomingSignal.aspect === 'red') {
                speedLimit = 0;
                if (upcomingSignal.distance < 0.1 && train.speedKmh > 2) {
                    // Signal passed at danger
                    train.performance.safetyViolations++;
                    train.performance.score -= 100;
                    this.showSystemMessage('⚠️ SIGNAL PASSED AT DANGER! Emergency braking!', 'error', 4000);
                    train.emergencyBrake = true;
                    train.brake = 1.0;
                }
            }
        }
        
        // Advanced physics calculation
        const tractionForce = train.throttle * physics.maxTractionForce * physics.traction;
        const brakeForce = train.brake * 400000; // Maximum brake force
        const dragForce = physics.aerodynamicDrag * train.speedKmh * train.speedKmh;
        const rollingForce = physics.rollingResistance * physics.weight * 9.81;
        
        const netForce = tractionForce - brakeForce - dragForce - rollingForce;
        physics.acceleration = netForce / physics.weight; // F = ma
        
        // Update speed with realistic physics
        const speedMs = train.speedKmh / 3.6; // Convert to m/s
        const newSpeedMs = Math.max(0, speedMs + physics.acceleration * dt);
        train.speedKmh = Math.min(speedLimit, newSpeedMs * 3.6);
        
        // Update position
        const avgSpeedMs = (speedMs + newSpeedMs) / 2;
        train.positionKm += (avgSpeedMs * dt) / 1000; // Convert to km
        train.positionKm = Math.min(train.positionKm, this.totalDistance);
        
        // Passenger comfort calculation
        const acceleration = Math.abs(physics.acceleration);
        if (acceleration > 1.5) { // High acceleration/deceleration
            train.performance.passengerComfort *= 0.999;
            if (acceleration > 3.0) {
                this.showSystemMessage('⚠️ Harsh acceleration - passenger discomfort!', 'warning', 2000);
                train.performance.score -= 5;
            }
        }
        
        // Environmental effects
        this.environment.bgOffset += (train.speedKmh / 3.6) * dt * 2; // Parallax scrolling
        this.updateCameraShake(dt);
        this.updateParticles(dt);
        
        // Station handling
        this.handleStationLogic(stationContext, dt);
        
        // Check for level crossings
        this.checkLevelCrossings();
        
        // Update UI
        this.updateUI();
        
        // Check for game completion
        if (train.positionKm >= this.totalDistance) {
            this.completeJourney();
        }
    }
    
    getStationContext(positionKm) {
        let currentIdx = 0;
        for (let i = 0; i < this.routeStations.length; i++) {
            if (positionKm >= this.routeStations[i].km) currentIdx = i;
        }
        
        const current = this.routeStations[currentIdx];
        const nextIdx = Math.min(currentIdx + 1, this.routeStations.length - 1);
        const next = this.routeStations[nextIdx];
        const distToNext = Math.max(0, next.km - positionKm);
        
        return { currentIdx, current, next, distToNext, nextIdx };
    }
    
    getUpcomingSignal(positionKm, lookAhead = 5) {
        for (const signal of this.signals) {
            const distance = signal.km - positionKm;
            if (distance >= 0 && distance <= lookAhead) {
                signal.distance = distance;
                return signal;
            }
        }
        return null;
    }
    
    isInStationArea(positionKm, stationKm, radius = 2.0) {
        return Math.abs(positionKm - stationKm) <= radius;
    }
    
    handleStationLogic(stationContext, dt) {
        const train = this.train;
        
        // Handle station dwelling
        if (train.dwellRemainingS > 0) {
            train.dwellRemainingS -= dt;
            train.speedKmh = 0;
            train.throttle = 0;
            train.brake = 1.0;
            
            if (train.dwellRemainingS <= 0) {
                train.brake = 0.2;
                this.showSystemMessage(`Departing ${stationContext.next.name}`, 'info', 2000);
            }
            return;
        }
        
        // Auto-stop at stations
        const distanceToStation = stationContext.distToNext;
        const isAtPlatform = distanceToStation < 0.05; // Within 50 meters
        
        if (isAtPlatform && train.speedKmh < 5) {
            // Arrived at station
            train.positionKm = stationContext.next.km;
            train.speedKmh = 0;
            train.throttle = 0;
            train.brake = 1.0;
            
            const station = stationContext.next;
            const dwellTime = this.gameConstants.DWELL_TIME_RANGE[0] + 
                Math.random() * (this.gameConstants.DWELL_TIME_RANGE[1] - this.gameConstants.DWELL_TIME_RANGE[0]);
            train.dwellRemainingS = dwellTime;
            
            // Handle passenger exchange
            this.handlePassengerExchange(station);
            train.atStationIndex = stationContext.nextIdx;
            
            // Performance scoring
            train.performance.score += 20; // On-time arrival bonus
            if (train.performance.passengerComfort > 0.95) {
                train.performance.score += 10; // Comfort bonus
            }
        }
    }
    
    handlePassengerExchange(station) {
        const train = this.train;
        const alighting = Math.min(train.passengers, station.passengers.alight);
        const boarding = Math.min(
            train.capacity - (train.passengers - alighting),
            station.passengers.board
        );
        
        train.passengers = train.passengers - alighting + boarding;
        
        this.showSystemMessage(
            `${station.name}: ${alighting} alighted, ${boarding} boarded`,
            'success',
            3000
        );
        
        // Add performance score based on passenger service
        train.performance.score += boarding * 0.5;
    }
    
    checkLevelCrossings() {
        const upcomingCrossing = this.levelCrossings.find(crossing => {
            const distance = crossing.km - this.train.positionKm;
            return distance >= 0 && distance <= 1.5;
        });
        
        if (upcomingCrossing && !upcomingCrossing.warning) {
            upcomingCrossing.warning = true;
            this.showSystemMessage(
                `🚧 Level crossing ahead in ${upcomingCrossing.km - this.train.positionKm:.1f} km - Sound horn!`,
                'warning',
                3000
            );
            
            // Auto-horn for safety (can be disabled in settings)
            if (this.train.speedKmh > 20) {
                setTimeout(() => this.playHorn(), 500);
            }
        }
    }
    
    updateCameraShake(dt) {
        this.camera.shake = Math.max(0, this.camera.shake - dt * 10);
        this.camera.targetShake = this.train.speedKmh * 0.02 + (this.train.emergencyBrake ? 5 : 0);
        this.camera.shake += (this.camera.targetShake - this.camera.shake) * dt * 5;
    }
    
    updateParticles(dt) {
        const particles = this.particleSystem.particles;
        
        // Update existing particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const particle = particles[i];
            particle.x += particle.vx * dt;
            particle.y += particle.vy * dt;
            particle.life -= dt;
            particle.vy += 200 * dt; // Gravity
            
            if (particle.life <= 0) {
                particles.splice(i, 1);
            }
        }
        
        // Generate new particles based on speed
        if (this.train.speedKmh > 30 && Math.random() < 0.3) {
            this.addParticle();
        }
    }
    
    addParticle() {
        if (this.particleSystem.particles.length >= this.particleSystem.maxParticles) return;
        
        this.particleSystem.particles.push({
            x: window.innerWidth * 0.35 + (Math.random() - 0.5) * 100,
            y: window.innerHeight * 0.7 + Math.random() * 20,
            vx: (Math.random() - 0.5) * 100 - this.train.speedKmh * 2,
            vy: -Math.random() * 50 - 20,
            life: 1 + Math.random() * 2,
            size: 2 + Math.random() * 4,
            color: `hsl(${Math.random() * 60 + 20}, 70%, 60%)`
        });
    }
    
    updateUI() {
        const train = this.train;
        const stationContext = this.getStationContext(train.positionKm);
        const upcomingSignal = this.getUpcomingSignal(train.positionKm);
        
        // Speed and controls
        this.ui.speedValue.textContent = Math.round(train.speedKmh);
        this.ui.throttleValue.textContent = Math.round(train.throttle * 100);
        this.ui.brakeValue.textContent = Math.round(train.brake * 100);
        
        // Progress bars
        this.ui.throttleBar.style.width = `${train.throttle * 100}%`;
        this.ui.brakeBar.style.width = `${train.brake * 100}%`;
        
        // Passengers
        this.ui.passengersValue.textContent = train.passengers;
        
        // Station info
        this.ui.currentStation.textContent = stationContext.current.name;
        this.ui.nextStation.textContent = stationContext.next.name;
        this.ui.nextStationDistance.textContent = stationContext.distToNext.toFixed(2);
        
        // Route progress
        const progress = (train.positionKm / this.totalDistance) * 100;
        this.ui.routeProgress.style.width = `${progress}%`;
        
        // Signal information
        if (upcomingSignal) {
            this.ui.signalAspect.textContent = upcomingSignal.aspect.toUpperCase();
            this.ui.signalLight.className = `signal-light ${upcomingSignal.aspect}`;
        } else {
            this.ui.signalAspect.textContent = 'GREEN';
            this.ui.signalLight.className = 'signal-light green';
        }
        
        // Speedometer needle
        const needleRotation = -90 + (train.speedKmh / this.gameConstants.MAX_SPEED_KMH) * 180;
        this.ui.speedNeedle.style.transform = `translate(-50%, -100%) rotate(${needleRotation}deg)`;
        this.ui.digitalSpeed.textContent = Math.round(train.speedKmh);
        
        // Dwell time indicator
        if (train.dwellRemainingS > 0) {
            this.ui.ruleHint.textContent = `Station stop: ${Math.ceil(train.dwellRemainingS)}s remaining`;
            this.ui.ruleHint.style.color = '#ffd700';
        } else {
            this.ui.ruleHint.textContent = this.generateRuleHint(stationContext, upcomingSignal);
            this.ui.ruleHint.style.color = '#00ff88';
        }
    }
    
    generateRuleHint(stationContext, upcomingSignal) {
        const train = this.train;
        
        // Priority hints
        if (upcomingSignal) {
            if (upcomingSignal.aspect === 'red') {
                return `🔴 RED SIGNAL - STOP before ${upcomingSignal.distance.toFixed(1)}km`;
            } else if (upcomingSignal.aspect === 'yellow') {
                return `🟡 CAUTION - Prepare to stop, limit ${this.gameConstants.YELLOW_SIGNAL_LIMIT} km/h`;
            }
        }
        
        const distToStation = stationContext.distToNext;
        if (distToStation < 3 && distToStation > 0.1) {
            return `🚉 Approaching ${stationContext.next.name} - Reduce speed`;
        }
        
        if (train.speedKmh > this.gameConstants.STATION_SPEED_LIMIT && 
            this.isInStationArea(train.positionKm, stationContext.next.km)) {
            return `⚠️ SPEED LIMIT ${this.gameConstants.STATION_SPEED_LIMIT} km/h in station area`;
        }
        
        if (train.speedKmh < 10 && train.throttle < 0.1 && !this.keys.brake) {
            return `💡 Apply throttle to accelerate (W key or ▲ button)`;
        }
        
        return `🚂 Journey progress: ${((train.positionKm / this.totalDistance) * 100).toFixed(1)}%`;
    }
    
    completeJourney() {
        this.gameState = 'completed';
        const train = this.train;
        const journeyTime = (Date.now() - this.startTime) / 1000;
        
        // Calculate final performance
        const timeBonus = Math.max(0, 1800 - journeyTime) * 0.5; // Bonus for completing under 30 minutes
        const comfortBonus = train.performance.passengerComfort * 100;
        const safetyPenalty = train.performance.safetyViolations * 50;
        
        train.performance.score += timeBonus + comfortBonus - safetyPenalty;
        train.performance.score = Math.max(0, Math.round(train.performance.score));
        
        // Update overlay
        this.ui.overlayTitle.textContent = 'Journey Complete!';
        this.ui.overlayMessage.textContent = 
            `Congratulations! You have successfully completed the Mumbai to Pune route.`;
        this.ui.finalTime.textContent = this.formatTime(journeyTime);
        this.ui.finalPassengers.textContent = train.passengers;
        this.ui.finalScore.textContent = train.performance.score;
        
        // Show overlay
        this.ui.gameOverlay.classList.remove('hidden');
        this.ui.gameOverlay.classList.add('show');
        
        this.showSystemMessage('🎉 Journey completed successfully!', 'success', 5000);
    }
    
    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
    
    restartGame() {
        // Reset all game state
        this.train.positionKm = 0;
        this.train.speedKmh = 0;
        this.train.throttle = 0;
        this.train.brake = 0;
        this.train.passengers = 120;
        this.train.dwellRemainingS = 0;
        this.train.atStationIndex = 0;
        this.train.emergencyBrake = false;
        this.train.performance = {
            score: 1000,
            onTimeBonus: 0,
            safetyViolations: 0,
            passengerComfort: 1.0
        };
        
        this.environment.bgOffset = 0;
        this.particleSystem.particles = [];
        this.camera.shake = 0;
        
        // Reset signals and crossings
        this.generateSignals();
        this.levelCrossings.forEach(crossing => crossing.warning = false);
        
        this.ui.gameOverlay.classList.add('hidden');
        this.ui.gameOverlay.classList.remove('show');
        
        this.gameState = 'playing';
        this.startTime = Date.now();
        
        this.showSystemMessage('🚂 New journey started!', 'success', 2000);
    }
    
    resumeGame() {
        this.ui.gameOverlay.classList.add('hidden');
        this.ui.gameOverlay.classList.remove('show');
        this.gameState = 'playing';
    }
    
    togglePause() {
        if (this.gameState === 'playing') {
            this.gameState = 'paused';
            this.showSystemMessage('Game Paused', 'info', 1000);
        } else if (this.gameState === 'paused') {
            this.gameState = 'playing';
            this.showSystemMessage('Game Resumed', 'info', 1000);
        }
    }
    
    render() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, w, h);
        
        // Apply camera shake
        if (this.camera.shake > 0) {
            const shakeX = (Math.random() - 0.5) * this.camera.shake;
            const shakeY = (Math.random() - 0.5) * this.camera.shake;
            this.ctx.translate(shakeX, shakeY);
        }
        
        if (this.gameState === 'playing' || this.gameState === 'completed') {
            // Debug: Draw a simple background first
            this.ctx.fillStyle = '#87ceeb';
            this.ctx.fillRect(0, 0, w, h);
            
            // Draw ground
            this.ctx.fillStyle = '#228b22';
            this.ctx.fillRect(0, h * 0.6, w, h * 0.4);
            
            this.renderEnvironment(w, h);
            this.renderTrack(w, h);
            this.renderTrain(w, h);
            this.renderStations(w, h);
            this.renderSignals(w, h);
            this.renderLevelCrossings(w, h);
            this.renderParticles();
            
            // Debug info
            this.ctx.fillStyle = 'white';
            this.ctx.font = '16px Arial';
            this.ctx.fillText(`Speed: ${Math.round(this.train.speedKmh)} km/h`, 10, 30);
            this.ctx.fillText(`Position: ${this.train.positionKm.toFixed(1)} km`, 10, 50);
            this.ctx.fillText(`Canvas: ${w}x${h}`, 10, 70);
            
            if (this.currentView === 'external') {
                this.renderExternalView(w, h);
            }
        }
        
        // Reset transform
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    
    renderEnvironment(w, h) {
        const horizonY = h * 0.6;
        
        // Enhanced ground with gradient
        const groundGradient = this.ctx.createLinearGradient(0, horizonY, 0, h);
        groundGradient.addColorStop(0, '#7fb96a');
        groundGradient.addColorStop(0.3, '#6ea85a');
        groundGradient.addColorStop(1, '#5d9749');
        
        this.ctx.fillStyle = groundGradient;
        this.ctx.fillRect(0, horizonY, w, h - horizonY);
        
        // Enhanced parallax hills with multiple layers
        this.renderParallaxHills(horizonY - 30, 0.2, '#4a6b5c', 0.15);
        this.renderParallaxHills(horizonY - 10, 0.4, '#3e5b6f', 0.1);
        this.renderParallaxHills(horizonY + 10, 0.6, '#2d4a5a', 0.05);
    }
    
    renderParallaxHills(baseY, amplitude, color, speedFactor) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        
        const seed = this.environment.bgOffset * speedFactor;
        const step = 30;
        this.ctx.moveTo(0, baseY);
        
        for (let x = 0; x <= w; x += step) {
            const y = baseY - 
                30 * Math.sin((x + seed) * 0.008) - 
                20 * Math.cos((x * 0.6 + seed * 0.4) * 0.012) -
                15 * Math.sin((x * 1.2 + seed * 0.8) * 0.015);
            this.ctx.lineTo(x, y);
        }
        
        this.ctx.lineTo(w, h);
        this.ctx.lineTo(0, h);
        this.ctx.closePath();
        this.ctx.fill();
    }
    
    renderTrack(w, h) {
        const trackY = h * 0.7;
        const sleeperSpacing = 30;
        const scroll = (this.environment.bgOffset * 0.5) % sleeperSpacing;
        
        // Simple sleepers
        this.ctx.fillStyle = '#8B4513';
        for (let x = -scroll; x < w + sleeperSpacing; x += sleeperSpacing) {
            this.ctx.fillRect(x - 8, trackY + 10, 16, 6);
        }
        
        // Simple rails
        this.ctx.fillStyle = '#444444';
        this.ctx.fillRect(0, trackY - 2, w, 4); // Left rail
        this.ctx.fillRect(0, trackY + 18, w, 4); // Right rail
        
        // Rail highlights
        this.ctx.fillStyle = '#666666';
        this.ctx.fillRect(0, trackY - 2, w, 1); // Left rail highlight
        this.ctx.fillRect(0, trackY + 18, w, 1); // Right rail highlight
    }
    
    renderStations(w, h) {
        const trackY = h * 0.7;
        const kmToPx = 15; // Reduce scale for better visibility
        const trainX = w * 0.5;
        
        const stationContext = this.getStationContext(this.train.positionKm);
        
        for (let i = 0; i < this.routeStations.length; i++) {
            const station = this.routeStations[i];
            const dxKm = station.km - this.train.positionKm;
            const x = trainX + dxKm * kmToPx;
            
            if (x < -300 || x > w + 300) continue;
            
            const isCurrentStation = i === stationContext.currentIdx;
            const isNextStation = i === stationContext.nextIdx;
            
            // Simple platform
            this.ctx.fillStyle = isCurrentStation ? '#ffff99' : '#cccccc';
            const platformWidth = 100;
            this.ctx.fillRect(x - platformWidth / 2, trackY - 12, platformWidth, 8);
            
            // Simple station building
            const buildingColor = isNextStation ? '#ff6600' : '#996633';
            this.ctx.fillStyle = buildingColor;
            this.ctx.fillRect(x - 25, trackY - 30, 50, 18);
            
            // Station name
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(station.name, x, trackY - 40);
            
            // Distance marker for next station
            if (isNextStation && dxKm > 0) {
                this.ctx.fillStyle = '#00ff88';
                this.ctx.font = '10px Orbitron, monospace';
                this.ctx.fillText(`${dxKm.toFixed(1)} km`, x, trackY - 65);
            }
        }
    }
    
    renderSignals(w, h) {
        const trackY = h * 0.7;
        const kmToPx = 20;
        const trainX = w * 0.4;
        
        for (const signal of this.signals) {
            const dxKm = signal.km - this.train.positionKm;
            const x = trainX + dxKm * kmToPx;
            
            if (x < -100 || x > w + 100) continue;
            
            // Signal post with 3D effect
            this.ctx.fillStyle = '#3a3a3a';
            this.ctx.fillRect(x - 3, trackY - 40, 6, 40);
            
            // Signal post shadow
            this.ctx.fillStyle = '#2a2a2a';
            this.ctx.fillRect(x - 2, trackY - 39, 5, 39);
            
            // Signal head
            this.ctx.fillStyle = '#1a1a1a';
            this.ctx.fillRect(x - 12, trackY - 40, 24, 12);
            
            // Signal lights with glow effect
            const lightY = trackY - 32;
            const radius = 5;
            
            // Red light
            this.ctx.beginPath();
            this.ctx.arc(x, lightY - 8, radius, 0, Math.PI * 2);
            if (signal.aspect === 'red') {
                this.ctx.fillStyle = '#ff5454';
                this.ctx.shadowBlur = 15;
                this.ctx.shadowColor = '#ff5454';
            } else {
                this.ctx.fillStyle = '#662d2d';
                this.ctx.shadowBlur = 0;
            }
            this.ctx.fill();
            
            // Yellow light
            this.ctx.beginPath();
            this.ctx.arc(x, lightY, radius, 0, Math.PI * 2);
            if (signal.aspect === 'yellow') {
                this.ctx.fillStyle = '#ffd24a';
                this.ctx.shadowBlur = 15;
                this.ctx.shadowColor = '#ffd24a';
            } else {
                this.ctx.fillStyle = '#6b5b2b';
                this.ctx.shadowBlur = 0;
            }
            this.ctx.fill();
            
            // Green light
            this.ctx.beginPath();
            this.ctx.arc(x, lightY + 8, radius, 0, Math.PI * 2);
            if (signal.aspect === 'green') {
                this.ctx.fillStyle = '#6fff84';
                this.ctx.shadowBlur = 15;
                this.ctx.shadowColor = '#6fff84';
            } else {
                this.ctx.fillStyle = '#255a2f';
                this.ctx.shadowBlur = 0;
            }
            this.ctx.fill();
            
            // Reset shadow
            this.ctx.shadowBlur = 0;
            
            // Distance marker for upcoming signals
            if (dxKm > 0 && dxKm < 3) {
                this.ctx.fillStyle = signal.aspect === 'red' ? '#ff5454' : 
                                   signal.aspect === 'yellow' ? '#ffd24a' : '#6fff84';
                this.ctx.font = '10px Orbitron, monospace';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(`${dxKm.toFixed(1)} km`, x, trackY - 50);
            }
        }
    }
    
    renderLevelCrossings(w, h) {
        const trackY = h * 0.7;
        const kmToPx = 20;
        const trainX = w * 0.4;
        
        for (const crossing of this.levelCrossings) {
            const dxKm = crossing.km - this.train.positionKm;
            const x = trainX + dxKm * kmToPx;
            
            if (x < -150 || x > w + 150) continue;
            
            // Crossing gate post
            this.ctx.fillStyle = '#b5342c';
            this.ctx.fillRect(x - 3, trackY - 15, 6, 50);
            
            // Gate arm with animation
            this.ctx.save();
            this.ctx.translate(x, trackY - 15);
            const armAngle = Math.sin((this.environment.bgOffset + crossing.km * 10) * 0.02) * 0.1;
            this.ctx.rotate(-Math.PI / 2 + armAngle);
            
            // Gate arm
            this.ctx.fillStyle = '#f5f5f5';
            this.ctx.fillRect(0, -3, 50, 6);
            
            // Red stripes on gate
            this.ctx.fillStyle = '#ff4757';
            for (let i = 5; i < 45; i += 10) {
                this.ctx.fillRect(i, -2, 4, 4);
            }
            
            this.ctx.restore();
            
            // Warning sign
            this.ctx.fillStyle = '#333333';
            this.ctx.fillRect(x - 15, trackY - 30, 30, 12);
            
            this.ctx.fillStyle = '#ffd700';
            this.ctx.font = 'bold 10px Orbitron, monospace';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('LEVEL CROSSING', x, trackY - 24);
            
            // Warning light (blinking if train is near)
            if (Math.abs(dxKm) < 1) {
                const blink = Math.sin(Date.now() * 0.01) > 0;
                if (blink) {
                    this.ctx.beginPath();
                    this.ctx.arc(x, trackY - 35, 4, 0, Math.PI * 2);
                    this.ctx.fillStyle = '#ff4757';
                    this.ctx.shadowBlur = 10;
                    this.ctx.shadowColor = '#ff4757';
                    this.ctx.fill();
                    this.ctx.shadowBlur = 0;
                }
            }
        }
    }
    
    renderTrain(w, h) {
        const trackY = h * 0.7;
        const trainX = w * 0.5; // Center the train
        
        // Simple but visible train
        const trainWidth = 120;
        const trainHeight = 25;
        
        // Train shadow
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.fillRect(trainX - trainWidth/2 + 3, trackY + 3, trainWidth, trainHeight);
        
        // Main engine body - bright blue to be clearly visible
        this.ctx.fillStyle = '#0066cc';
        this.ctx.fillRect(trainX - trainWidth/2, trackY - trainHeight, trainWidth, trainHeight);
        
        // Engine front - red
        this.ctx.fillStyle = '#cc0000';
        this.ctx.fillRect(trainX + trainWidth/2 - 15, trackY - trainHeight + 3, 15, trainHeight - 6);
        
        // Engine front with 3D effect
        this.ctx.fillStyle = '#e66347';
        this.ctx.fillRect(trainX + trainWidth/2 - 25, trackY - trainHeight + 5, 25, trainHeight - 10);
        
        // Front highlight
        this.ctx.fillStyle = '#ff8c69';
        this.ctx.fillRect(trainX + trainWidth/2 - 24, trackY - trainHeight + 6, 3, trainHeight - 12);
        
        // Windows with reflections
        this.ctx.fillStyle = '#9fb5c9';
        const windowWidth = 50;
        const windowHeight = 15;
        for (let i = 0; i < 3; i++) {
            const windowX = trainX - 60 + i * 30;
            this.ctx.fillRect(windowX, trackY - trainHeight + 8, windowWidth, windowHeight);
            
            // Window reflection
            this.ctx.fillStyle = '#cfd9e6';
            this.ctx.fillRect(windowX, trackY - trainHeight + 8, windowWidth, 3);
            this.ctx.fillStyle = '#9fb5c9';
        }
        
        // Enhanced wheels with rotation animation
        this.ctx.fillStyle = '#1f262e';
        const wheelPositions = [-60, -20, 20, 60];
        const rotation = (this.environment.bgOffset * 0.1) % (Math.PI * 2);
        
        for (const wheelOffset of wheelPositions) {
            const wheelX = trainX + wheelOffset;
            const wheelY = trackY + 8;
            const wheelRadius = 8;
            
            // Wheel shadow
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            this.ctx.beginPath();
            this.ctx.arc(wheelX + 2, wheelY + 2, wheelRadius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Main wheel
            this.ctx.fillStyle = '#1f262e';
            this.ctx.beginPath();
            this.ctx.arc(wheelX, wheelY, wheelRadius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Wheel spokes (rotating)
            this.ctx.strokeStyle = '#444';
            this.ctx.lineWidth = 2;
            for (let spoke = 0; spoke < 6; spoke++) {
                const angle = rotation + (spoke * Math.PI) / 3;
                this.ctx.beginPath();
                this.ctx.moveTo(wheelX, wheelY);
                this.ctx.lineTo(
                    wheelX + Math.cos(angle) * (wheelRadius - 2),
                    wheelY + Math.sin(angle) * (wheelRadius - 2)
                );
                this.ctx.stroke();
            }
        }
        
        // Smoke and steam effects
        if (this.train.speedKmh > 20) {
            this.renderSmokeEffect(trainX + 60, trackY - trainHeight - 10);
        }
        
        // Horn effect
        if (this.train.horn) {
            this.renderHornEffect(trainX, trackY - trainHeight - 5);
        }
        
        // Headlights
        if (this.train.headlights) {
            this.ctx.beginPath();
            this.ctx.arc(trainX + trainWidth/2 - 10, trackY - trainHeight/2, 5, 0, Math.PI * 2);
            this.ctx.fillStyle = '#ffffe0';
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = '#ffffe0';
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        }
    }
    
    renderSmokeEffect(x, y) {
        const time = Date.now() * 0.001;
        
        for (let i = 0; i < 5; i++) {
            const puffY = y - i * 15 - Math.sin(time + i) * 10;
            const puffX = x + Math.sin(time * 0.5 + i) * 20;
            const size = 8 + i * 4;
            const alpha = Math.max(0, 0.5 - i * 0.1);
            
            this.ctx.globalAlpha = alpha;
            this.ctx.fillStyle = '#e8f0f7';
            this.ctx.beginPath();
            this.ctx.arc(puffX, puffY, size, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        this.ctx.globalAlpha = 1;
    }
    
    renderHornEffect(x, y) {
        // Visual horn effect - sound waves
        const time = Date.now() * 0.01;
        
        for (let i = 1; i <= 3; i++) {
            this.ctx.strokeStyle = `rgba(255, 255, 0, ${0.5 - i * 0.1})`;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(x, y, 20 + i * 15 + Math.sin(time) * 5, 0, Math.PI * 2);
            this.ctx.stroke();
        }
    }
    
    renderParticles() {
        for (const particle of this.particleSystem.particles) {
            const alpha = particle.life / 3;
            this.ctx.globalAlpha = alpha;
            this.ctx.fillStyle = particle.color;
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            this.ctx.fill();
        }
        this.ctx.globalAlpha = 1;
    }
    
    renderExternalView(w, h) {
        // Different camera angle for external view
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        this.ctx.fillRect(0, 0, w, h);
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '16px Orbitron, monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('External View', w / 2, 50);
        this.ctx.fillText(`Speed: ${Math.round(this.train.speedKmh)} km/h`, w / 2, 80);
    }
    
    gameLoop() {
        const currentTime = performance.now();
        const deltaTime = Math.min((currentTime - (this.lastTime || currentTime)) / 1000, 1/30);
        this.lastTime = currentTime;
        
        if (this.gameState === 'playing') {
            this.updatePhysics(deltaTime);
        }
        
        this.render();
        requestAnimationFrame(() => this.gameLoop());
    }
}

// Initialize the game when page loads
document.addEventListener('DOMContentLoaded', () => {
    new AdvancedTrainSimulator();
});