# app.py

# ==============================================================================
# BACKEND SERVER LOGIC (app.py)
# ==============================================================================
# This script runs the Flask web server that acts as the game's "backend".
#
# CORE LOGIC:
# - It manages the race state, including each racer's stats and linear progress.
# - The race is simulated as a simple linear distance (e.g., 0 to 1600 meters).
#   The backend does NOT know about the visual elliptical path; it only cares
#   about who is in what position along this linear track.
# - It provides API endpoints (like /game_state, /start_race, /cheer) for the
#   frontend to communicate with.
#
# FRONTEND COMMUNICATION:
# - All visual presentation, including drawing the racers on the elliptical
#   track, is handled by the client's browser using JavaScript (see static/race.js).
#
# SERVER NOTE:
# - The server initialization and file paths used here are standard for Flask.
#   Your specific deployment environment (e.g., on a production server) might
#   require different configurations.
# ==============================================================================

import time
import random
import threading
from flask import Flask, render_template, jsonify

# --- Game Configuration ---
# You can set this to 400 for a single-lap race or 1600 for a 4-lap race.
RACE_DISTANCE = 1600
TICK_INTERVAL = 0.1
MAX_PLAYERS = 6

# --- Global State Management ---
race_instance = None
race_thread = None
app = Flask(__name__)

# ==============================================================================
# RACER AND RACE CLASSES (Core Game Simulation)
# ==============================================================================
# This section defines the fundamental rules of the race.
class Racer:
    def __init__(self, name, speed, power, stamina):
        self.name = name
        self.base_speed = speed
        self.power = power
        self.max_stamina = stamina
        self.current_stamina = stamina
        self.position = 0.0
        self.finish_time = None
        self.finished = False
        self.active_buff = None
        self.buff_duration = 0
        self.buffed_stat = None

    def update_position(self):
        if self.finished:
            return
        stamina_factor = max(0.2, self.current_stamina / self.max_stamina)
        current_speed = self.base_speed
        if self.buffed_stat == 'speed':
            current_speed += self.active_buff
        movement = (current_speed * stamina_factor + self.power * 0.1) * TICK_INTERVAL
        self.position += movement
        self.current_stamina = max(0, self.current_stamina - (2 * TICK_INTERVAL))

    def update_buff(self):
        if self.active_buff:
            self.buff_duration -= TICK_INTERVAL
            if self.buff_duration <= 0:
                buff_expired_event = f"buff_expire: {self.name}'s {self.buffed_stat} boost wore off."
                self.active_buff = None
                self.buff_duration = 0
                self.buffed_stat = None
                return buff_expired_event
        return None

    # --- Cheer & Ability Handling ---
    # This section manages the random outcomes of a "cheer" action.
    def cheer(self):
        events = [f"cheer: {self.name.upper()} IS BEING CHEERED!"]
        if random.random() < 0.35:
            events.extend(self.use_ability())
        else:
            events.extend(self.apply_random_buff())
        return events

    def use_ability(self):
        # ======================================================================
        # CUSTOMIZABLE ABILITY LOGIC
        # ======================================================================
        # Currently, all racers share a generic ability. To create unique
        # abilities, you would expand this function with character-specific logic.
        #
        # Example:
        # if self.name == "Tracer":
        #     self.position -= 50 # Recall ability
        #     return [f"ability: {self.name} uses Recall!", f"voiceline: Ever get that feeling of déjà vu?"]
        # elif self.name == "Reinhardt":
        #     # Give Reinhardt a temporary power boost instead of position
        #     ...
        # ======================================================================
        abilities = {
            "Tracer": ("Recall", "Ever get that feeling of déjà vu?"), "Genji": ("Swift Strike", "Mizu no yō ni nagare"),
            "Lúcio": ("Amp It Up", "Oh, let's break it down!"), "Sojourn": ("Power Slide", "Time to make an impact."),
            "Widowmaker": ("Grappling Hook", "No one can hide."), "Reinhardt": ("Charge", "Hammer down!")
        }
        ability_name, voiceline = abilities.get(self.name, ("Generic Boost", "Let's go!"))
        events = [f"ability: {self.name} uses {ability_name}!", f"voiceline: \"{voiceline}\""]
        self.position += 50
        return events

    def apply_random_buff(self):
        if self.active_buff:
            return [f"buff_fail: {self.name} is already buffed."]
        stat = random.choice(['speed', 'power', 'stamina'])
        amount = round(random.uniform(5, 15), 2)
        duration = round(random.uniform(3, 8), 2)
        self.active_buff = amount
        self.buff_duration = duration
        self.buffed_stat = stat
        if stat == 'stamina':
            self.current_stamina = min(self.max_stamina, self.current_stamina + amount)
        return [f"buff_apply: {self.name} gets a +{amount} boost to {stat.upper()} for {duration}s!"]

    def to_dict(self):
        return {"name": self.name, "position": self.position, "finished": self.finished, "finish_time": self.finish_time}


class Race:
    def __init__(self, racers):
        self.racers = racers
        self.race_clock = 0
        self.finish_order = []
        self.last_ranks = self.get_current_ranks()
        self.events = []
        self.is_running = True

    def get_current_ranks(self):
        return sorted(self.racers, key=lambda r: r.position, reverse=True)

    def check_overtakes(self):
        current_ranks = self.get_current_ranks()
        for i, racer in enumerate(current_ranks):
            try:
                previous_rank_index = self.last_ranks.index(racer)
                if i < previous_rank_index:
                    overtaken_racer = self.last_ranks[i]
                    if not overtaken_racer.finished:
                        self.events.append(f"overtake: [{racer.name}] overtakes [{overtaken_racer.name}]!")
            except ValueError: pass
        self.last_ranks = current_ranks

    def simulation_loop(self):
        self.events.append("event: ====== THE RACE IS ON! ======")
        while len(self.finish_order) < MAX_PLAYERS:
            time.sleep(TICK_INTERVAL)
            self.race_clock += TICK_INTERVAL
            racers_in_race = [r for r in self.racers if not r.finished]
            if racers_in_race and random.random() < 0.05:
                self.events.extend(random.choice(racers_in_race).cheer())
            for racer in self.racers:
                buff_event = racer.update_buff()
                if buff_event: self.events.append(buff_event)
                racer.update_position()
                if racer.position >= RACE_DISTANCE and not racer.finished:
                    racer.finished = True
                    racer.finish_time = round(self.race_clock, 2)
                    self.finish_order.append(racer)
                    self.events.append(f"finish: {racer.name} has finished the race!")
            self.check_overtakes()
        self.events.append("event: ====== RACE CONCLUDED! ======")
        self.is_running = False

# --- Flask API Endpoints ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/start_race', methods=['POST'])
def start_race():
    global race_instance, race_thread
    if race_thread and race_thread.is_alive():
        return jsonify({"status": "error", "message": "Race already in progress."}), 400
    racers = [
        Racer("Tracer", 55, 30, 80), Racer("Genji", 52, 35, 90),
        Racer("Lúcio", 58, 25, 100), Racer("Sojourn", 50, 40, 85),
        Racer("Widowmaker", 48, 20, 75), Racer("Reinhardt", 45, 50, 110)
    ]
    race_instance = Race(racers)
    race_thread = threading.Thread(target=race_instance.simulation_loop)
    race_thread.start()
    return jsonify({"status": "success", "message": "Race started."})

@app.route('/game_state')
def game_state():
    if not race_instance:
        return jsonify({"status": "error", "message": "Race not started."}), 404
    racers_data = [r.to_dict() for r in race_instance.racers]
    events_data = race_instance.events[:]
    race_instance.events.clear()
    return jsonify({
        "status": "running" if race_instance.is_running else "finished",
        "race_clock": round(race_instance.race_clock, 2),
        "racers": racers_data,
        "events": events_data,
        "race_distance": RACE_DISTANCE
    })

@app.route('/cheer/<racer_name>', methods=['POST'])
def cheer(racer_name):
    if not race_instance or not race_instance.is_running:
        return jsonify({"status": "error", "message": "No active race."}), 400
    racer = next((r for r in race_instance.racers if r.name == racer_name), None)
    if racer and not racer.finished:
        race_instance.events.extend(racer.cheer())
        return jsonify({"status": "success", "message": f"Cheered for {racer_name}."})
    else:
        return jsonify({"status": "error", "message": "Racer not found or has finished."}), 404

if __name__ == '__main__':
    app.run(debug=True)