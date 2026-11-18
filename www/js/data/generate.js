// Fictional player and club generator. Used for calibration now, and later for draft classes,
// international signings and a fallback database.
import { Rng } from '../core/rng.js';

export const FIRST = ['Aaron', 'Alex', 'Andre', 'Ben', 'Blake', 'Brandon', 'Carlos', 'Chris', 'Cody', 'Colin', 'Connor', 'Dan', 'Dario', 'David', 'Diego', 'Drew', 'Eli', 'Eric', 'Felix', 'Gabe', 'Grant', 'Hank', 'Isaac', 'Jake', 'Javier', 'Jesse', 'Joe', 'Jon', 'Jorge', 'Jose', 'Juan', 'Kenji', 'Kyle', 'Luis', 'Luke', 'Manny', 'Marcus', 'Mario', 'Matt', 'Miguel', 'Nate', 'Nick', 'Noah', 'Owen', 'Pablo', 'Paul', 'Rafael', 'Ricky', 'Roy', 'Ryan', 'Sam', 'Sean', 'Shane', 'Taylor', 'Theo', 'Tim', 'Tomas', 'Trey', 'Tyler', 'Victor', 'Will', 'Yuki', 'Zach', 'Abel', 'Adam', 'Adrian', 'Alan', 'Albert', 'Alec', 'Alejandro', 'Alexis', 'Alfredo', 'Allen', 'Alonso', 'Andy', 'Angel', 'Anthony', 'Antonio', 'Arturo', 'Austin', 'Beau', 'Bennett', 'Bernardo', 'Billy', 'Bo', 'Bobby', 'Braden', 'Bradley', 'Brady', 'Brandt', 'Brendan', 'Brett', 'Brian', 'Bryce', 'Bryan', 'Caleb', 'Calvin', 'Cameron', 'Carl', 'Carter', 'Cesar', 'Chad', 'Chance', 'Charlie', 'Chase', 'Chico', 'Clay', 'Clint', 'Colby', 'Cole', 'Cooper', 'Corey', 'Craig', 'Curtis', 'Dale', 'Dalton', 'Damian', 'Daniel', 'Danny', 'Darius', 'Darnell', 'Darren', 'Dawson', 'Dean', 'Dennis', 'Derek', 'Devin', 'Dominic', 'Donnie', 'Doug', 'Dustin', 'Dylan', 'Edgar', 'Eddie', 'Edwin', 'Elias', 'Elijah', 'Emanuel', 'Emilio', 'Enrique', 'Ernesto', 'Esteban', 'Ethan', 'Evan', 'Fabian', 'Fernando', 'Francisco', 'Frankie', 'Freddy', 'Gage', 'Garrett', 'Gavin', 'Gene', 'George', 'Gerardo', 'Gilberto', 'Gus', 'Gustavo', 'Hayden', 'Hector', 'Henry', 'Hugo', 'Hunter', 'Ian', 'Ignacio', 'Isaiah', 'Ivan', 'Jackson', 'Jaden', 'Jaime', 'Jamal', 'James', 'Jared', 'Jason', 'Jasper', 'Jay', 'Jeff', 'Jeremy', 'Jerome', 'Jim', 'Joaquin', 'Joel', 'Johnny', 'Jonah', 'Jordan', 'Josh', 'Joshua', 'Julian', 'Julio', 'Justin', 'Keegan', 'Keith', 'Kelvin', 'Ken', 'Kendall', 'Kevin', 'Kirk', 'Kobe', 'Kurt', 'Lance', 'Landon', 'Larry', 'Lawrence', 'Leo', 'Leon', 'Levi', 'Liam', 'Lionel', 'Logan', 'Lorenzo', 'Louis', 'Lucas', 'Malik', 'Manuel', 'Marco', 'Marlon', 'Martin', 'Mason', 'Mateo', 'Mathew', 'Maurice', 'Max', 'Micah', 'Michael', 'Mickey', 'Mike', 'Mitch', 'Mohammed', 'Morgan', 'Nash', 'Neil', 'Nelson', 'Nico', 'Nolan', 'Omar', 'Orlando', 'Oscar', 'Otis', 'Parker', 'Patrick', 'Pedro', 'Perry', 'Peyton', 'Phil', 'Quentin', 'Quincy', 'Rafe', 'Ramon', 'Randy', 'Raul', 'Ray', 'Reed', 'Reggie', 'Rene', 'Rey', 'Reuben', 'Rhett', 'Ricardo', 'Rich', 'Riley', 'Rob', 'Robbie', 'Roberto', 'Rodrigo', 'Roger', 'Roman', 'Ronnie', 'Ross', 'Rudy', 'Russ', 'Sal', 'Santiago', 'Saul', 'Scott', 'Sergio', 'Seth', 'Silas', 'Simon', 'Stan', 'Stefan', 'Stephen', 'Sterling', 'Stevie', 'Tanner', 'Terrell', 'Tevin', 'Thad', 'Thomas', 'Toby', 'Todd', 'Tommy', 'Tony', 'Travis', 'Trent', 'Trevor', 'Tristan', 'Troy', 'Ty', 'Tyrone', 'Ulises', 'Vance', 'Vicente', 'Vince', 'Wade', 'Walker', 'Warren', 'Wesley', 'Wilson', 'Wyatt', 'Xavier', 'Yadiel', 'Yoan', 'Yordan', 'Zane', 'Zeke', 'Takumi', 'Hiroki', 'Ryo', 'Haruto', 'Min-jun', 'Jae', 'Hyun', 'Dong', 'Wei', 'Jian', 'Tae', 'Shohei', 'Koji', 'Daiki', 'Sota', 'Kaito'];
export const LAST = ['Abbott', 'Alvarez', 'Archer', 'Baker', 'Bell', 'Branson', 'Brooks', 'Castillo', 'Chen', 'Cooper', 'Cruz', 'Delgado', 'Dempsey', 'Diaz', 'Dunlap', 'Ellis', 'Fitch', 'Flores', 'Foster', 'Gaines', 'Garcia', 'Grant', 'Hargrove', 'Hayes', 'Hollis', 'Ibarra', 'Jensen', 'Keane', 'Kowal', 'Lang', 'Larkin', 'Lopez', 'Marsh', 'Medina', 'Mercer', 'Mori', 'Morales', 'Navarro', 'Nolan', 'Okafor', 'Ortega', 'Park', 'Pena', 'Pike', 'Price', 'Pruitt', 'Quiles', 'Ramos', 'Reyes', 'Ruiz', 'Salas', 'Shaw', 'Soria', 'Stone', 'Tallis', 'Teague', 'Torres', 'Vance', 'Vargas', 'Walsh', 'Watts', 'Wells', 'Yates', 'Young', 'Acosta', 'Adams', 'Aguilar', 'Ahn', 'Alexander', 'Allison', 'Anderson', 'Andrews', 'Arroyo', 'Atkins', 'Austin', 'Avila', 'Bailey', 'Banks', 'Barker', 'Barnes', 'Barrett', 'Bautista', 'Beck', 'Bennett', 'Benson', 'Bishop', 'Black', 'Blair', 'Blanco', 'Bowman', 'Boyd', 'Bradley', 'Brady', 'Bravo', 'Briggs', 'Brock', 'Brown', 'Bryant', 'Burke', 'Burns', 'Burton', 'Bustos', 'Byrd', 'Cabrera', 'Cain', 'Calderon', 'Camacho', 'Campbell', 'Cardenas', 'Carlson', 'Carpenter', 'Carrillo', 'Carson', 'Carter', 'Cervantes', 'Chambers', 'Chandler', 'Chavez', 'Cho', 'Christian', 'Clark', 'Clarke', 'Cline', 'Cobb', 'Cole', 'Collins', 'Colon', 'Conley', 'Contreras', 'Cook', 'Cortez', 'Cox', 'Craig', 'Crawford', 'Crosby', 'Cummings', 'Curry', 'Dalton', 'Daniels', 'Davenport', 'Davidson', 'Davis', 'Dawson', 'Day', 'Dean', 'Decker', 'Dennis', 'Dickson', 'Dixon', 'Dominguez', 'Donovan', 'Douglas', 'Doyle', 'Duarte', 'Duffy', 'Duncan', 'Dunn', 'Durham', 'Eaton', 'Edwards', 'Elliott', 'Emerson', 'Escobar', 'Espinoza', 'Estrada', 'Evans', 'Farmer', 'Farrell', 'Ferguson', 'Fernandez', 'Fields', 'Figueroa', 'Fischer', 'Fisher', 'Fleming', 'Fletcher', 'Fontaine', 'Ford', 'Fowler', 'Fox', 'Francis', 'Franco', 'Frazier', 'Freeman', 'Fuentes', 'Fuller', 'Gallagher', 'Gallegos', 'Garner', 'Garrett', 'Gibson', 'Gilbert', 'Gill', 'Glover', 'Goldman', 'Gomez', 'Gonzales', 'Goodwin', 'Gordon', 'Graham', 'Gray', 'Green', 'Greer', 'Griffin', 'Guerrero', 'Gutierrez', 'Guzman', 'Hahn', 'Hall', 'Hamilton', 'Hammond', 'Hampton', 'Hanson', 'Harden', 'Harmon', 'Harper', 'Harris', 'Harrison', 'Hart', 'Harvey', 'Hawkins', 'Hendricks', 'Henry', 'Hernandez', 'Herrera', 'Hicks', 'Higgins', 'Hill', 'Hines', 'Hoffman', 'Holland', 'Holloway', 'Holt', 'Hood', 'Hopkins', 'Horton', 'Houston', 'Howard', 'Huang', 'Hubbard', 'Hudson', 'Huff', 'Hughes', 'Hunt', 'Hunter', 'Hurst', 'Hutchins', 'Ingram', 'Irwin', 'Jackson', 'Jacobs', 'Jacobson', 'James', 'Jarvis', 'Jefferson', 'Jenkins', 'Jimenez', 'Johnson', 'Jones', 'Jordan', 'Joyce', 'Juarez', 'Kane', 'Kang', 'Kaplan', 'Kelley', 'Kelly', 'Kemp', 'Kennedy', 'Kerr', 'Kim', 'King', 'Kirby', 'Klein', 'Knight', 'Knox', 'Koch', 'Kramer', 'Lam', 'Landry', 'Lane', 'Lara', 'Lawson', 'Leach', 'Leblanc', 'Lee', 'Leon', 'Lewis', 'Li', 'Lindsey', 'Little', 'Lloyd', 'Logan', 'Long', 'Lowe', 'Lucas', 'Lugo', 'Lynch', 'Mack', 'Maddox', 'Maldonado', 'Malone', 'Mann', 'Manning', 'Marin', 'Marks', 'Marquez', 'Martin', 'Martinez', 'Mason', 'Massey', 'Mata', 'Mathis', 'Matthews', 'Maxwell', 'May', 'Mayo', 'McBride', 'McCarthy', 'McCoy', 'McDaniel', 'McGee', 'McKay', 'McKinney', 'Mejia', 'Mendez', 'Mendoza', 'Meyer', 'Miles', 'Miller', 'Mills', 'Miranda', 'Mitchell', 'Molina', 'Monroe', 'Montes', 'Montoya', 'Moon', 'Moore', 'Moran', 'Moreno', 'Morgan', 'Morris', 'Morrison', 'Morrow', 'Mosley', 'Moss', 'Mueller', 'Munoz', 'Murphy', 'Murray', 'Myers', 'Nash', 'Neal', 'Nelson', 'Newman', 'Newton', 'Nguyen', 'Nichols', 'Nixon', 'Noble', 'Norman', 'Norris', 'Norton', 'Nunez', 'Oakes', 'Ochoa', 'Oliver', 'Olsen', 'Olson', 'Orr', 'Ortiz', 'Osborne', 'Owens', 'Pacheco', 'Padilla', 'Page', 'Palmer', 'Parker', 'Parks', 'Parsons', 'Patel', 'Patterson', 'Paul', 'Payne', 'Pearce', 'Pearson', 'Pereira', 'Perez', 'Perkins', 'Perry', 'Peters', 'Peterson', 'Phelps', 'Phillips', 'Pierce', 'Pineda', 'Pittman', 'Poole', 'Porter', 'Potter', 'Powell', 'Pratt', 'Preston', 'Quinn', 'Quintero', 'Ramirez', 'Ramsey', 'Randall', 'Rasmussen', 'Ray', 'Redd', 'Reed', 'Reese', 'Reid', 'Rhodes', 'Rice', 'Richards', 'Richardson', 'Riddle', 'Riggs', 'Rios', 'Rivera', 'Rivers', 'Roberts', 'Robertson', 'Robinson', 'Robles', 'Rocha', 'Rodriguez', 'Rogers', 'Roman', 'Romero', 'Rose', 'Ross', 'Rowe', 'Roy', 'Rubio', 'Rush', 'Russell', 'Ryan', 'Salazar', 'Salinas', 'Sanchez', 'Sanders', 'Sandoval', 'Santana', 'Santiago', 'Santos', 'Sawyer', 'Schmidt', 'Schneider', 'Schultz', 'Schwartz', 'Scott', 'Sexton', 'Shannon', 'Sharp', 'Shelton', 'Shepherd', 'Sherman', 'Silva', 'Simmons', 'Simon', 'Simpson', 'Sims', 'Singh', 'Skinner', 'Slater', 'Small', 'Smith', 'Snyder', 'Solis', 'Sosa', 'Spencer', 'Stafford', 'Stanley', 'Stark', 'Steele', 'Stephens', 'Stevens', 'Stewart', 'Strickland', 'Strong', 'Stuart', 'Sullivan', 'Summers', 'Sutton', 'Swanson', 'Sweeney', 'Tanaka', 'Tate', 'Taylor', 'Thomas', 'Thompson', 'Thornton', 'Tran', 'Trevino', 'Tucker', 'Turner', 'Tyler', 'Underwood', 'Valdez', 'Valencia', 'Valentine', 'Vasquez', 'Vaughn', 'Vega', 'Velasquez', 'Villanueva', 'Wagner', 'Walker', 'Wallace', 'Walters', 'Wang', 'Ward', 'Warner', 'Warren', 'Washington', 'Waters', 'Watkins', 'Watson', 'Weaver', 'Webb', 'Weber', 'Webster', 'Weiss', 'West', 'Wheeler', 'White', 'Whitney', 'Wiley', 'Williams', 'Willis', 'Wilson', 'Winters', 'Wise', 'Wolfe', 'Wong', 'Wood', 'Woods', 'Wright', 'Wu', 'Yang', 'York', 'Zamora', 'Zhang', 'Zimmerman'];

/** A name nobody in the game has yet (first and last together), so new arrivals are not copies of players already here. */
export function freshName(rng, taken) {
  let first, last;
  for (let k = 0; k < 40; k++) {
    first = rng.pick(FIRST); last = rng.pick(LAST);
    if (!taken || !taken.has(`${first} ${last}`)) break;
  }
  taken?.add(`${first} ${last}`);
  return { first, last };
}

const CLUBS = [
  ['Mesa', 'Rattlers', '#a3262a'], ['Bay City', 'Gulls', '#14305c'], ['Portland', 'Pioneers', '#1e5b3a'], ['Boise', 'Miners', '#4a3b2a'],
  ['Halifax', 'Mariners', '#0f3d5e'], ['Quebec', 'Voyageurs', '#2a4d9b'], ['Tulsa', 'Drillers', '#7a1f1f'], ['El Paso', 'Suns', '#c46a12'],
  ['Savannah', 'Herons', '#2f6f6a'], ['Raleigh', 'Foxes', '#8c3b16'], ['Fresno', 'Grizzlies', '#5a2a6e'], ['Spokane', 'Falls', '#1f4f7a'],
  ['Omaha', 'Stockmen', '#6b4a1e'], ['Louisville', 'Sluggers', '#9b1c2e'], ['Memphis', 'Kings', '#2b2b6e'], ['Reno', 'Aces', '#3d3d3d'],
  ['Nashville', 'Strings', '#b5651d'], ['Buffalo', 'Bison', '#22346b'], ['Albany', 'Patroons', '#4b6f2a'], ['Tucson', 'Saguaros', '#2e7d4f'],
  ['Hartford', 'Charter Oaks', '#1d4d2b'], ['Wichita', 'Wind', '#5e7f9a'], ['Richmond', 'Admirals', '#162d5a'], ['Toledo', 'Glass', '#2a7f8f'],
  ['Durham', 'Bulls', '#2b5c8a'], ['Sacramento', 'Rivercats', '#6a1f4f'], ['Austin', 'Armadillos', '#8a5a2b'], ['Charlotte', 'Hornets', '#1a6b6b'],
  ['Montreal', 'Royals', '#123a7a'], ['Honolulu', 'Waves', '#0d6e8a'],
];

const POS9 = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

function grade(rng, mean = 50, sd = 6) {
  return Math.max(20, Math.min(80, Math.round(rng.normal(mean, sd) / 5) * 5));
}

let nextId = 1;

export function makeHitter(rng, pos, quality = 50) {
  const def = { C: [45, 55], SS: [55, 60], '2B': [50, 55], '3B': [50, 55], CF: [55, 60], '1B': [45, 45], LF: [50, 50], RF: [50, 55], DH: [40, 40] }[pos] || [50, 50];
  const speed = grade(rng, pos === 'CF' || pos === 'SS' ? 55 : pos === 'C' || pos === 'DH' || pos === '1B' ? 42 : 50, 9);
  const bats = rng.chance(0.08) ? 'S' : rng.chance(0.36) ? 'L' : 'R';
  // one shared talent level per hitter, so tools are correlated as they are in real players
  const offence = (pos === 'DH' || pos === '1B' ? quality + 4 : pos === 'C' || pos === 'SS' ? quality - 3 : quality) + rng.normal(0, 3);
  return {
    id: `p${nextId++}`, first: rng.pick(FIRST), last: rng.pick(LAST), bats, throws: bats === 'L' && pos !== 'C' && pos !== 'SS' && pos !== '2B' && pos !== '3B' ? 'L' : 'R',
    pos, age: rng.int(21, 36),
    r: {
      contact: grade(rng, offence, 4), power: grade(rng, offence, 5), eye: grade(rng, offence, 6), avoidK: grade(rng, offence, 7),
      gb: grade(rng, 50), pull: grade(rng, 50), speed, instincts: grade(rng, 50), steal: grade(rng, speed - 3, 9), bunt: grade(rng, 45),
      range: grade(rng, def[0]), hands: grade(rng, 50), arm: grade(rng, def[1]), framing: pos === 'C' ? grade(rng, 50) : 50,
    },
  };
}

export function makePitcher(rng, role, quality = 50) {
  const throws = rng.chance(0.28) ? 'L' : 'R';
  const starter = role === 'Starter';
  const pitches = starter
    ? { 'Four-seam': grade(rng, quality), Slider: grade(rng, quality - 2), Changeup: grade(rng, quality - 5), Curveball: grade(rng, quality - 6) }
    : { 'Four-seam': grade(rng, quality + 2), Slider: grade(rng, quality) };
  return {
    id: `p${nextId++}`, first: rng.pick(FIRST), last: rng.pick(LAST), bats: throws, throws, pos: 'P', role, age: rng.int(22, 36),
    pitches,
    r: {
      stuff: grade(rng, starter ? quality : quality + 2), movement: grade(rng, quality), control: grade(rng, quality),
      stamina: grade(rng, starter ? 55 : 30, 6), hold: grade(rng, 50), pgb: grade(rng, 50), velocity: grade(rng, starter ? quality : quality + 3),
      range: 45, hands: 50, arm: 50,
    },
  };
}

/** A club with a 9-man lineup (DH), 4 bench players, 5 starters and an 8-man bullpen. */
export function makeTeam(rng, i, quality = 50) {
  const [city, name, kitA] = CLUBS[i % CLUBS.length];
  const hitters = POS9.map((pos) => makeHitter(rng, pos, quality));
  // batting order: best on-base types first, power in the middle
  const score = (p) => p.r.contact + p.r.eye + p.r.power;
  const sorted = [...hitters].sort((a, b) => score(b) - score(a));
  const order = [sorted[2], sorted[1], sorted[0], sorted[3], sorted[4], sorted[5], sorted[6], sorted[7], sorted[8]];
  const roles = ['Closer', 'Setup', 'Matchup', 'Middle', 'Middle', 'Middle', 'Long', 'Long'];
  return {
    id: `T${i}`, city, name, abbr: city.slice(0, 3).toUpperCase(), kitA, kitB: '#ffffff', acc: kitA,
    lineup: order.map((p) => ({ player: p, pos: p.pos })),
    bench: ['C', 'IF', 'OF', '1B'].map((pos) => makeHitter(rng, pos === 'IF' ? 'SS' : pos === 'OF' ? 'CF' : pos, quality - 5)),
    rotation: [0, 1, 2, 3, 4].map(() => makePitcher(rng, 'Starter', quality)),
    bullpen: roles.map((r) => makePitcher(rng, r, r === 'Closer' ? quality + 6 : r === 'Setup' ? quality + 4 : quality)),
  };
}

export function makeLeague(seed = 'league', n = 30) {
  const rng = new Rng(seed);
  nextId = 1;
  // club strengths vary, but the league as a whole averages exactly 50
  const q = Array.from({ length: n }, () => rng.normal(0, 2.5));
  const mean = q.reduce((a, b) => a + b, 0) / n;
  return q.map((x, i) => makeTeam(rng, i, 50 + x - mean));
}

/** Engine team for one game: picks the starter from the rotation. */
export function gameTeam(team, starterIdx) {
  return { ...team, starter: team.rotation[starterIdx % team.rotation.length], bench: team.bench, bullpen: team.bullpen };
}
