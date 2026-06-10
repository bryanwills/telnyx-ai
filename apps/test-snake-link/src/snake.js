const canvas = document.querySelector("#board");
const scoreEl = document.querySelector("#score");
const restart = document.querySelector("#restart");
const ctx = canvas.getContext("2d");
const cells = 20;
const size = canvas.width / cells;

let snake;
let food;
let direction;
let nextDirection;
let score;
let timer;

function reset() {
  snake = [
    { x: 9, y: 10 },
    { x: 8, y: 10 },
    { x: 7, y: 10 },
  ];
  direction = { x: 1, y: 0 };
  nextDirection = direction;
  score = 0;
  scoreEl.textContent = String(score);
  placeFood();
  clearInterval(timer);
  timer = setInterval(tick, 115);
  draw();
}

function placeFood() {
  do {
    food = {
      x: Math.floor(Math.random() * cells),
      y: Math.floor(Math.random() * cells),
    };
  } while (snake.some((part) => part.x === food.x && part.y === food.y));
}

function tick() {
  direction = nextDirection;
  const head = {
    x: (snake[0].x + direction.x + cells) % cells,
    y: (snake[0].y + direction.y + cells) % cells,
  };

  if (snake.some((part) => part.x === head.x && part.y === head.y)) {
    reset();
    return;
  }

  snake.unshift(head);
  if (head.x === food.x && head.y === food.y) {
    score += 1;
    scoreEl.textContent = String(score);
    placeFood();
  } else {
    snake.pop();
  }

  draw();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f6f4f1";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ef476f";
  roundCell(food.x, food.y, 7);

  snake.forEach((part, index) => {
    ctx.fillStyle = index === 0 ? "#111111" : "#06d6a0";
    roundCell(part.x, part.y, 6);
  });
}

function roundCell(x, y, radius) {
  const inset = 3;
  const left = x * size + inset;
  const top = y * size + inset;
  const width = size - inset * 2;
  ctx.beginPath();
  ctx.roundRect(left, top, width, width, radius);
  ctx.fill();
}

function setDirection(name) {
  const moves = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const move = moves[name];
  if (!move || move.x + direction.x === 0 && move.y + direction.y === 0) return;
  nextDirection = move;
}

document.addEventListener("keydown", (event) => {
  const keyMap = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    s: "down",
    a: "left",
    d: "right",
  };
  if (keyMap[event.key]) {
    event.preventDefault();
    setDirection(keyMap[event.key]);
  }
});

document.querySelectorAll("[data-dir]").forEach((button) => {
  button.addEventListener("click", () => setDirection(button.dataset.dir));
});

restart.addEventListener("click", reset);
reset();
