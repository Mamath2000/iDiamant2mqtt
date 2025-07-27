const position = (state) => {
    switch (state) {
        case 'open': return 100;
        case 'closed': return 0;
        case 'half_open': return 20;
        case 'opening': return 100; // En ouverture, on considère que c'est ouvert
        case 'closing': return 0; // En fermeture, on considère que c'est fermé
        case 'stopped': return 20; // Arrêté, on reste à mi-ouvert
        default: return null; // Inconnu
    }
};

const translate = (state) => {
    switch (state) {
        case 'open': return 'Ouvert';
        case 'closed': return 'Fermé';
        case 'opening': return 'Ouverture';
        case 'closing': return 'Fermeture';
        case 'half_open': return 'Mi-ouvert';
        case 'stopped': return 'Arrêté';
        default: return 'Inconnu';
    }
};
const _getTransitionDelay = (from_position, from_state, cmd) => {
    const delayMs = {
        open_delay: 42000,
        close_delay: 42000,
        close_to_half_open_delay: 4500,
        half_open_to_open_delay: 30000,
        half_open_to_close_delay: 10000,
    }

    if (cmd === 'stop') {
        return 0;
    } else if (from_state ==='half_open') {
        if (cmd === 'open') {
            return delayMs.half_open_to_open_delay;
        } else if (cmd === 'close') {
            return delayMs.half_open_to_close_delay;
        }
    } else if (from_state === 'closed') {
        if (cmd === 'open') {
            return delayMs.open_delay;
        } else if (cmd === 'half_open') {
            return delayMs.close_to_half_open_delay;
        }
    } else if (from_state === 'open') {
        if (cmd === 'close') {
            return delayMs.close_delay;
        } else if (cmd === 'half_open') {
            return delayMs.close_delay + delayMs.close_to_half_open_delay;
        }
    } else {
        if (cmd === 'open') {
            return delayMs.open_delay * (1- (from_position / 100));
        } else if (cmd === 'close') {
            return delayMs.close_delay * (from_position / 100);
        } else if (cmd === 'half_open') {
            return delayMs.close_delay * (from_position / 100) + delayMs.close_to_half_open_delay;
        }
    }
}

const getTransition = (from_state, from_position, cmd) => {
    delayMs = _getTransitionDelay(from_position, from_state, cmd);
    switch (cmd) {
        case "open":
            return { delay: delayMs, from_state, transition_state: "opening", to_state: "open", target_position: 100 };
        case "close":
            return { delay: delayMs, from_state, transition_state: "closing", to_state: "closed", target_position: 0 };
        case "half_open":
            return { delay: delayMs, from_state, transition_state: "opening", to_state: "half_open", target_position: 20 };
        case "stop":
            return { delay: delayMs, from_state, transition_state: "stopped", to_state: "stopped", target_position: from_position };
        default:
            return { delay: delayMs, from_state, transition_state: "unknown", to_state: "unknown", target_position: 50 };
    }

};

function formatDate(ts) {
    const d = new Date(ts);
    const pad = n => n.toString().padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
module.exports = { 
    position,
    translate,
    getTransition,
    formatDate
};

