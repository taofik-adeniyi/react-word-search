import * as _ from "lodash";

export enum WSDirections {
  UP = 1,
  DOWN,
  LEFT,
  RIGHT,
  UP_RIGHT,
  UP_LEFT,
  DOWN_RIGHT,
  DOWN_LEFT,
  NONE
}

export enum WSCase {
  LOWER,
  UPPER
}

export interface WordsConfig {
  /**
   * amount of words to generate
   */
  amount: number;
  /**
   * minimum word size
   */
  minLength: number;
  /**
   * max word size
   */
  maxLength: number;
  /**
   * list of words to pick from
   */
  dictionary: string[];
  /**
   * Upper case or Lower case
   * this also transforms words in dictionary
   */
  case: WSCase;
  /**
   * specify whether we are picking random words
   * or if we are using sequential
   * @default true
   */
  random: boolean;
  /**
   * send debug info to the console?
   */
  debug: boolean;
}

export interface WordsearchInput {
  size: number;
  wordsConfig: Partial<WordsConfig>;

  allowedDirections: WSDirections[];
  allowWordOverlap: boolean;
}

export interface WordsearchConfig {
  size: number;
  wordsConfig: WordsConfig;
  allowedDirections: WSDirections[];
  allowWordOverlap: boolean;
}

export interface Vector2D {
  x: number;
  y: number;
}

export interface Cell {
  pos: Vector2D;
  letter: string;
  shown: boolean;
  found: boolean;
  selected: boolean;
  selectable: boolean;
  highlighted: boolean;
}

export interface Word {
  word: string;
  pos: Vector2D[];
  found: boolean;
  shown: boolean;
}

export interface WordsearchOutput {
  board: Cell[][];
  words: Word[];
  currentWord: string;
  endGame: boolean;
  error: string;
}

export interface ValidationMsg {
  valid: boolean;
  msg: string;
}

export interface WordDrawInstruction {
  word: string;
  startPos: Vector2D;
  direction: WSDirections;
}

/**
 * had to get rid of default dictionary until I find isomorphic words package
 * @type {string[]}
 */
const commonEnglishWords: string[] = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight"
];

const takeSrcArray = (dest, src) => {
  if (_.isArray(dest)) {
    return src;
  }
};

export class Wordsearch {
  protected config: WordsearchConfig;
  protected defaultConfig: WordsearchConfig = {
    size: 15,
    wordsConfig: {
      amount: 8,
      minLength: 2,
      maxLength: 8,
      dictionary: [...commonEnglishWords],
      case: WSCase.UPPER,
      random: true,
      debug: true
    },
    allowedDirections: [
      /**
       * un-natural directions are disabled
       * by default
       */
      WSDirections.DOWN,
      WSDirections.RIGHT,
      WSDirections.DOWN_RIGHT
      //WSDirections.LEFT,
      //WSDirections.UP,
      //WSDirections.UP_LEFT,
      //WSDirections.UP_RIGHT,
      //WSDirections.DOWN_LEFT
    ],
    allowWordOverlap: true
  };
  protected output: WordsearchOutput;

  private directions2D: Vector2D[] = [
    //noop
    { x: 0, y: 0 },
    //up
    { x: -1, y: 0 },
    //down
    { x: 1, y: 0 },
    //left
    { x: 0, y: -1 },
    //right
    { x: 0, y: 1 },
    //up right
    { x: -1, y: 1 },
    //up left
    { x: -1, y: -1 },
    //down right
    { x: 1, y: 1 },
    //down left
    { x: 1, y: -1 },
    //NONE
    { x: 0, y: 0 }
  ];

  private selectedCount: number = 0;
  private selectedDirection: WSDirections = WSDirections.NONE;
  private generationTimes: number = 0;
  private allDirections: WSDirections[] = [
    WSDirections.DOWN,
    WSDirections.DOWN_LEFT,
    WSDirections.DOWN_RIGHT,
    WSDirections.UP,
    WSDirections.UP_LEFT,
    WSDirections.UP_RIGHT,
    WSDirections.LEFT,
    WSDirections.RIGHT
  ];
  private lastSelectedVector: Vector2D | null = null;

  constructor() {
    this.config = { ...this.defaultConfig };
  }

  /**
   * get current output
   * @returns {WordsearchOutput}
   */
  public getOutput = (): WordsearchOutput => this.output;

  /**
   * Sets a config param or all of it
   * @param {Partial<WordsearchInput>} config
   * @returns {boolean}
   */
  public setConfig = (config?: Partial<WordsearchInput>) => {
    if (config) {
      config = this.parseStringsInConfig(config);
      this.config = _.mergeWith(this.config, config, takeSrcArray);
    }
    this.setCase();
    return !!config;
  };

  /**
   * gets the current config
   * @returns {WordsearchInput}
   */
  public getConfig = (): WordsearchConfig => this.config;

  /**
   * shows words in board and returns true if exists, else returns false
   * also handles if its a submital or a discovery
   * @param {string} word
   * @param {boolean} submit
   * @returns {boolean}
   */
  public showWord = (word: string, submit: boolean = false): boolean => {
    const index = this.getWordIndex(word);
    if (index >= 0 && !submit) {
      //discover the word
      this.discoverWord(index);
    } else if (index >= 0 && submit) {
      this.setWordAsFound(index);
    }
    return index >= 0;
  };

  /**
   * generates a board with the current input
   * @param {Partial<WordsearchInput>} config
   * @returns {WordsearchOutput}
   */
  public generate = (config?: Partial<WordsearchInput>): WordsearchOutput => {
    this.setConfig(config);
    const valid = this.validConfig();
    if (valid.valid) {
      try {
        const words = this.getWords();
        const blankBoard = this.getBlankBoard();
        this.output = {
          words: [],
          board: blankBoard,
          currentWord: "",
          endGame: false,
          error: ""
        };

        this.resetCurrentSelection();

        //run all modifications needed
        this.allocateWordsInBoard(words);

        //fill in chars
        this.fillInRandomChars();

        //reset generation times
        this.generationTimes = 0;

        return this.output;
      } catch (e) {
        //try again until we can generate the game
        //max 50 iterations
        this.generationTimes++;
        if (this.generationTimes > 50) {
          this.generationTimes = 0;
          this.throwError(
            "Unable to generate game, max amount of iterations reached. " + e.toString()
          );
        } else {
          console.log(
            "trying to generate board... try# ",
            this.generationTimes
          );
          return this.generate(config);
        }
      }
    } else {
      this.throwError("Invalid configuration: " + valid.msg);
    }
    return this.output;
  };

  /**
   * select a cell based on position
   * @param {Vector2D} pos
   * @returns {boolean}
   */
  public selectCell = (pos: Vector2D): boolean => {
    if (this.output.board[pos.x][pos.y].selectable) {
      if (!this.lastSelectedVector) {
        this.output.board[pos.x][pos.y].selected = true;
        this.output.currentWord += this.output.board[pos.x][pos.y].letter;
        this.selectedCount++;
        this.lastSelectedVector = { ...pos };
        this.calculateSelectables(pos);
        return true;
      } else {
        const direction = this.getDirectionFrom2Vectors(
          this.lastSelectedVector,
          pos
        );
        if (direction) {
          let leVector = this.moveInDirection(
            this.lastSelectedVector,
            direction
          );
          let found = false;
          while (leVector && !found) {
            this.output.board[leVector.x][leVector.y].selected = true;
            this.output.currentWord += this.output.board[leVector.x][
              leVector.y
            ].letter;
            this.selectedCount++;
            found = _.isEqual(leVector, pos);
            leVector = this.moveInDirection(leVector, direction);
          }
          this.lastSelectedVector = { ...pos };
          this.calculateSelectables(pos);
          return true;
        }
      }
    }
    return false;
  };

  /**
   * unhighlights the board
   */
  public unHighlightBoard = () => {
    this.setCellFieldTo("highlighted", false);
  };

  /**
   * resets the current selection
   */
  public resetCurrentSelection = () => {
    this.selectedCount = 0;
    this.selectedDirection = WSDirections.NONE;
    this.output.currentWord = "";
    this.lastSelectedVector = null;
    this.setCellFieldTo("selected", false);
    this.setCellFieldTo("highlighted", false);
    this.calculateSelectables();
  };

  /**
   * returns true if current word is a word from the list
   * and also discovers it, returns false if it does not exists
   * @returns {boolean}
   */
  public submitCurrentWord = (): boolean => {
    const win = this.showWord(this.output.currentWord, true);
    this.resetCurrentSelection();
    this.checkEnd();
    return win;
  };

  /**
   * prints an ascii representation of the board to the console
   */
  public consolePrintBoard = () => {
    for (let x = 0; x < this.config.size; x++) {
      for (let y = 0; y < this.config.size; y++) {
        const lett = this.output.board[x][y].letter
          ? this.output.board[x][y].letter
          : " ";
        process.stdout.write("|" + lett);
      }
      console.log("|");
    }
  };

  /**
   * highlights the cells in between the last selected
   * and another
   * @param {Vector2D} pos
   */
  public highlightCell = (pos: Vector2D): boolean => {
    if (this.lastSelectedVector) {
      this.hightlightCells(this.lastSelectedVector, pos);
      return true;
    }
    return false;
  };

  /**
   * low level highlight cells
   * @param {Vector2D} from
   * @param {Vector2D} to
   */
  private hightlightCells = (from: Vector2D, to: Vector2D) => {
    //reset all cells
    this.setCellFieldTo("highlighted", false);
    //draw highlight on new pos if found
    const direction = this.getDirectionFrom2Vectors(from, to);
    if (direction) {
      let leVector = this.moveInDirection(from, direction);
      let found = false;
      while (leVector && !found) {
        found = _.isEqual(leVector, to);
        this.output.board[leVector.x][leVector.y].highlighted = true;
        leVector = this.moveInDirection(leVector, direction);
      }
    }
  };

  /**
   * tries to determine the direction from point 1 to point 2 else
   * return null
   * @param {Vector2D} vector1
   * @param {Vector2D} vector2
   * @returns {WSDirections | null}
   */
  private getDirectionFrom2Vectors = (
    vector1: Vector2D,
    vector2: Vector2D
  ): WSDirections | null => {
    let foundDirection: WSDirections | null = null;
    this.allDirections.forEach(direction => {
      let leVector = this.moveInDirection(vector1, direction);
      while (leVector && !foundDirection) {
        if (_.isEqual(leVector, vector2)) {
          foundDirection = direction;
        }
        leVector = this.moveInDirection(leVector, direction);
      }
      return;
    });
    return foundDirection;
  };

  /**
   * returns the list of words to be used bsed on config
   * @returns {string[]}
   */
  private getWords = (): string[] => {
    if (this.config.wordsConfig.random) {
      return this.getRandomWordsFromDictionary();
    } else {
      return this.getSequentialWords();
    }
  };

  /**
   * gets a list of words from the dictionary sequentially that meet the criteria
   * @returns {string[]}
   */
  private getSequentialWords = (): string[] => {
    const words: string[] = [];
    let w = 0;
    while (words.length < this.config.wordsConfig.amount) {
      if (w === this.config.wordsConfig.dictionary.length) {
        this.throwError(
          "dictionary does not contain enough words to fulfill your request"
        );
      }
      const word = this.config.wordsConfig.dictionary[w];
      const shouldWe = this.wordCriteria(word, words);
      if (shouldWe) {
        words.push(word);
      }
      w++;
    }
    return words;
  };

  /**
   * throws and error
   * @param {string} error
   */
  private throwError = (error: string) => {
    this.output.error = error;
    throw new Error(error);
  };

  /**
   * sell all letters and words to their corresponding case
   */
  private setCase = () => {
    if (this.output) {
      this.setCellFieldTo("letter", letter => this.getStrInCase(letter));
      this.output.words = this.output.words.map(
        (w: Word): Word => {
          return {
            ...w,
            word: this.getStrInCase(w.word)
          };
        }
      );
    }
    this.config.wordsConfig.dictionary = this.config.wordsConfig.dictionary.map(
      w => this.getStrInCase(w)
    );
  };

  /**
   * gets a string on the configured case
   * @param {string} str
   * @returns {string}
   */
  private getStrInCase = (str: string): string => {
    return this.config.wordsConfig.case === WSCase.UPPER
      ? str.toLocaleUpperCase()
      : str.toLowerCase();
  };

  /**
   * checks for endgame
   * @returns {boolean}
   */
  private checkEnd = () => {
    let fORd = 0;
    for (let w = 0; w < this.config.size; w++) {
      if (this.output.words[w]) {
        if (this.output.words[w].found || this.output.words[w].shown) {
          fORd++;
        }
      }
    }
    const isEnd = fORd === this.output.words.length;
    this.output.endGame = isEnd;
    return isEnd;
  };

  /**
   * word was actually found
   * @param {number} wordIndex
   */
  private setWordAsFound = (wordIndex: number) => {
    if (this.output.words[wordIndex]) {
      this.output.words[wordIndex].pos.forEach(p => {
        this.output.board[p.x][p.y].found = true;
      });
      this.output.words[wordIndex].found = true;
    }
  };

  /**
   * recalculates the selectables cells depending on current selected ones
   */
  private calculateSelectables = (lastSelection?: Vector2D) => {
    //set selectables to true depending on conditions
    if (this.selectedCount === 0) {
      this.setCellFieldTo("selectable", true);
    }

    /**
     * make selectable all allowed directions cells
     * adjacent to the selected cell
     */
    if (this.selectedCount === 1 && lastSelection) {
      this.setCellFieldTo("selectable", false);
      this.config.allowedDirections.forEach(wsDirection => {
        let newVector = this.moveInDirection(lastSelection, wsDirection);
        while (newVector) {
          if (newVector) {
            this.output.board[newVector.x][newVector.y].selectable = true;
          }
          newVector = this.moveInDirection(newVector, wsDirection);
        }
      });
    }

    /**
     * direction stablished, only one cell is allowed
     * the one following on that direction
     */
    if (this.selectedCount > 1) {
      this.setCellFieldTo("selectable", false);
      //determine direction
      if (lastSelection) {
        const selectedDirection = this.getAdjacentSelectedVectorDirection(
          lastSelection
        );
        if (typeof selectedDirection === "number" && selectedDirection >= 0) {
          const inversedDirection = this.getInverseDirection(selectedDirection);
          if (typeof inversedDirection === "number" && inversedDirection >= 0) {
            let sVector = this.moveInDirection(
              lastSelection,
              inversedDirection
            );
            while (sVector) {
              if (sVector) {
                this.output.board[sVector.x][sVector.y].selectable = true;
              }
              sVector = this.moveInDirection(sVector, inversedDirection);
            }
          }
        }
      }
    }
  };

  /**
   * returns the direction that is selected nex to that one
   * @param {Vector2D} vector
   * @returns {Vector2D | null}
   */
  private getAdjacentSelectedVectorDirection = (
    vector: Vector2D
  ): WSDirections | null => {
    const allDirections = [
      WSDirections.DOWN,
      WSDirections.DOWN_LEFT,
      WSDirections.DOWN_RIGHT,
      WSDirections.LEFT,
      WSDirections.RIGHT,
      WSDirections.UP,
      WSDirections.UP_LEFT,
      WSDirections.UP_RIGHT
    ];

    for (let d = 0; d < allDirections.length; d++) {
      const newVector = this.moveInDirection(vector, allDirections[d]);
      if (newVector) {
        if (this.output.board[newVector.x][newVector.y].selected) {
          return allDirections[d];
        }
      }
    }
    return null;
  };

  /**
   * returns the opposite direction from a given
   * direction
   * @param {WSDirections} direction
   * @returns {WSDirections | null}
   */
  private getInverseDirection = (
    direction: WSDirections
  ): WSDirections | null => {
    switch (direction) {
      case WSDirections.UP:
        return WSDirections.DOWN;
      case WSDirections.DOWN:
        return WSDirections.UP;
      case WSDirections.LEFT:
        return WSDirections.RIGHT;
      case WSDirections.RIGHT:
        return WSDirections.LEFT;
      case WSDirections.UP_RIGHT:
        return WSDirections.DOWN_LEFT;
      case WSDirections.UP_LEFT:
        return WSDirections.DOWN_RIGHT;
      case WSDirections.DOWN_RIGHT:
        return WSDirections.UP_LEFT;
      case WSDirections.DOWN_LEFT:
        return WSDirections.UP_RIGHT;
    }
    return null;
  };

  /**
   * utility to set all cells field to a variable
   * @param {string} field
   * @param value
   */
  private setCellFieldTo = (field: string, value: any) => {
    const currentSize = this.output.board.length;
    for (let x = 0; x < currentSize; x++) {
      for (let y = 0; y < currentSize; y++) {
        if (typeof value === "function") {
          this.output.board[x][y][field] = value(
            this.output.board[x][y][field]
          );
        } else {
          this.output.board[x][y][field] = value;
        }
      }
    }
  };

  /**
   * parses strings to ints on numeric fields
   * @param {Partial<WordsearchInput>} config
   * @returns {Partial<WordsearchInput>}
   */
  private parseStringsInConfig = (
    config: Partial<WordsearchInput>
  ): Partial<WordsearchInput> => {
    if (typeof config.size === "string") {
      config.size = parseInt(config.size, 10);
    }
    if (config.wordsConfig) {
      if (typeof config.wordsConfig.maxLength === "string") {
        config.wordsConfig.maxLength = parseInt(
          config.wordsConfig.maxLength,
          10
        );
      }
      if (typeof config.wordsConfig.minLength === "string") {
        config.wordsConfig.minLength = parseInt(
          config.wordsConfig.minLength,
          10
        );
      }
      if (typeof config.wordsConfig.amount === "string") {
        config.wordsConfig.amount = parseInt(config.wordsConfig.amount, 10);
      }
    }
    return config;
  };

  /**
   * returns index of word if found, else returns -1
   * @param {string} word
   * @returns {number}
   */
  private getWordIndex = (word: string): number => {
    for (let w = 0; w < this.output.words.length; w++) {
      if (this.output.words[w].word === word) {
        return w;
      }
    }
    return -1;
  };

  /**
   * sets discovered flag in board in case that index exists
   * @param {number} wordIndex
   */
  private discoverWord = (wordIndex: number) => {
    if (this.output.words[wordIndex]) {
      this.output.words[wordIndex].pos.forEach(p => {
        this.output.board[p.x][p.y].shown = true;
      });
      this.output.words[wordIndex].shown = true;
    }
  };

  /**
   * will go trough each cell and place a random letter if empty
   */
  private fillInRandomChars = () => {
    for (let x = 0; x < this.config.size; x++) {
      for (let y = 0; y < this.config.size; y++) {
        if (!this.output.board[x][y].letter) {
          this.output.board[x][y].letter = this.getRandomChar();
        }
      }
    }
  };

  /**
   * returns a random char a-z range
   * @returns {string}
   */
  private getRandomChar = (): string => {
    const abc = this.getStrInCase("abcdefghijklmnopqrstuvwxyz");
    const charPos = this.getRandomInteger(0, abc.length - 1);
    return abc[charPos];
  };

  /**
   * tries to allocate all the words in a current board
   * @param {string[]} words
   * @returns {Cell[][]}
   */
  private allocateWordsInBoard = (words: string[]) => {
    let w = 0;
    const l = words.length;
    while (w < l) {
      const wd = this.fitWordInRandomPos(words[w]);
      if (wd) {
        this.drawWordInBoard(wd);
      }
      w++;
    }
  };

  /**
   * tries to fit a word in a board
   * @param {string} word
   * @param {WSDirections[]} allowedDirections
   * @returns {WordDrawInstruction | null}
   */
  private fitWordInRandomPos = (
    word: string,
    allowedDirections?: WSDirections[]
  ): WordDrawInstruction | null => {
    const directions: WSDirections[] = allowedDirections
      ? [..._.shuffle(allowedDirections)]
      : [..._.shuffle(this.config.allowedDirections)];

    //get random ordered cells
    const randomCells = [
      ...(_.shuffle(_.flattenDeep(this.output.board)) as Cell[])
    ];

    while (randomCells.length) {
      //check each direction and pos
      const cell = randomCells.pop();
      for (let d = 0; d < directions.length; d++) {
        if (cell) {
          if (this.doesWordFit(word, cell.pos, directions[d])) {
            if (!this.doesWordCollide(word, cell.pos, directions[d])) {
              return {
                word,
                startPos: cell.pos,
                direction: directions[d]
              };
            }
          }
        }
      }
    }

    return this.throwError("Could not fit word in board: " + word);
  };

  /**
   * draws a word in a board
   * @param {WordDrawInstruction} wd
   * @returns {Cell[][]}
   */
  private drawWordInBoard = (wd: WordDrawInstruction): Cell[][] => {
    const cells = this.output.board;
    const startPos: Vector2D = wd.startPos;
    //draw the first letter
    cells[startPos.x][startPos.y].letter = wd.word[0];

    const positions: Vector2D[] = [];

    positions.push({
      x: startPos.x,
      y: startPos.y
    });

    let newPos: Vector2D | null = startPos;
    for (let c = 1; c < wd.word.length; c++) {
      newPos = this.moveInDirection(newPos as Vector2D, wd.direction);
      if (newPos) {
        cells[newPos.x][newPos.y].letter = wd.word[c];
        positions.push({
          x: newPos.x,
          y: newPos.y
        });
      }
    }

    //save word position data
    this.output.words.push({
      word: wd.word,
      pos: positions,
      found: false,
      shown: false
    });

    return cells;
  };

  /**
   * checks if a word collides or not
   * @param {string} word
   * @param {Vector2D} startPos
   * @param {WSDirections} direction
   * @returns {boolean}
   */
  private doesWordCollide = (
    word: string,
    startPos: Vector2D,
    direction: WSDirections
  ): boolean => {
    let newPos: Vector2D = { ...startPos };
    for (let c = 0; c < word.length; c++) {
      if (this.isCharCollision(word[c], newPos)) {
        return true;
      }
      const np = this.moveInDirection(newPos, direction);
      if (np) {
        newPos = np;
      } else {
        return true;
      }
    }
    return false;
  };

  /**
   * if allow overlap is true, it will return false if char is the same,
   * else it will return true for any character that is not empty
   * @param {string} char
   * @param {Vector2D} pos
   */
  private isCharCollision = (char: string, pos: Vector2D): boolean => {
    const boardChar = this.output.board[pos.x][pos.y].letter;
    if (this.config.allowWordOverlap) {
      if (boardChar === char) {
        return false;
      }
    }
    return !!boardChar;
  };

  /**
   * tells if a given word fits on the specified stat pos
   * and direction
   * @param {string} word
   * @param {Vector2D} startPos
   * @param {WSDirections} direction
   * @returns {boolean}
   */
  private doesWordFit = (
    word: string,
    startPos: Vector2D,
    direction: WSDirections
  ): boolean => {
    if (!this.isVectorInBoard(startPos)) {
      return false;
    }
    let tempV: Vector2D | null = { ...startPos };
    for (let c = 0; c < word.length; c++) {
      if (tempV) {
        tempV = this.moveInDirection(tempV, direction);
      } else {
        return false;
      }
    }
    return true;
  };

  /**
   * utility to move inside the board
   * @param {Vector2D} startPos
   * @param {WSDirections} direction
   * @returns {Vector2D | null}
   */
  private moveInDirection = (
    startPos: Vector2D,
    direction: WSDirections
  ): Vector2D | null => {
    const directionVector = this.getDirectionVector(direction);
    const newVector: Vector2D = {
      x: startPos.x + directionVector.x,
      y: startPos.y + directionVector.y
    };
    if (this.isVectorInBoard(newVector)) {
      return newVector;
    }
    return null;
  };

  /**
   * checks if a vector remains inside
   * @param {Vector2D} vector
   * @returns {boolean}
   */
  private isVectorInBoard = (vector: Vector2D): boolean => {
    if (vector.x >= 0 && vector.x < this.config.size) {
      if (vector.y >= 0 && vector.y < this.config.size) {
        return true;
      }
    }
    return false;
  };

  /**
   * gets a random direction vector from allowed directions
   * @returns {Vector2D}
   */
  private getRandomAllowedDirection = (): Vector2D => {
    return this.getDirectionVector(
      this.config.allowedDirections[
        this.getRandomInteger(0, this.config.allowedDirections.length - 1)
      ]
    );
  };

  /**
   * returns a direction vector
   * @param {WSDirections} direction
   * @returns {Vector2D}
   */
  private getDirectionVector = (direction: WSDirections): Vector2D => {
    return this.directions2D[direction];
  };
  /**
   * gets a random integer from a range
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  private getRandomInteger = (min: number, max: number): number => {
    return Math.floor(Math.random() * (max - min) + min);
  };

  /**
   * resets the board
   * @returns {Cell[][]}
   */
  private getBlankBoard = (): Cell[][] => {
    const cells: Cell[][] = [];

    //construct board blank
    const { size } = this.config;

    //initialize blank
    for (let x = 0; x < size; x++) {
      cells.push([]);
      for (let y = 0; y < size; y++) {
        cells[x].push({
          pos: {
            x,
            y
          },
          letter: "",
          shown: false,
          found: false,
          selected: false,
          selectable: true,
          highlighted: false
        });
      }
    }
    return cells;
  };

  /**
   * checks if a words meets the criteria
   * @param word
   * @param {string[]} list
   * @returns {boolean}
   */
  private wordCriteria = (word, list: string[]): boolean => {
    const wc = this.config.wordsConfig;
    return (
      //is a string
      typeof word === "string" &&
      //has something in it
      word.length > 0 &&
      //is aword that we dont have yet
      list.indexOf(word) < 0 &&
      //is the correct size
      word.length >= wc.minLength &&
      word.length <= wc.maxLength
    );
  };

  /**
   * returns a list of random words from the dictionary that meet
   * the configuration criteria
   * @returns {string[]}
   */
  private getRandomWordsFromDictionary = (): string[] => {
    const words: string[] = [];
    let tries = 100;
    while (words.length < this.config.wordsConfig.amount) {
      const word = this.getRandomWord();
      const shouldWe = this.wordCriteria(word, words);
      if (shouldWe) {
        words.push(word);
      }
      tries--;
      if(!tries) {
        this.throwError("Not enough words in dictionary.");
      }
    }

    return words;
  };

  /**
   * just gets a random word
   * @returns {string}
   */
  private getRandomWord = (): string => {
    const randInt = parseInt(
      Math.floor(
        Math.random() * this.config.wordsConfig.dictionary.length
      ).toString(),
      10
    );
    return this.config.wordsConfig.dictionary[randInt];
  };

  /**
   * validates a config input before generating a new webgame
   * @returns {Partial<ValidationMsg>}
   */
  private validConfig = (): Partial<ValidationMsg> => {
    const invalid: ValidationMsg = {
      valid: false,
      msg: ""
    };
    //check size of board
    if (this.config.size < 6 || this.config.size > 50) {
      invalid.msg = "Board size must be between 6 and 50";
      return invalid;
    }

    //check that amount of words are between 1 and 50
    const wc = this.config.wordsConfig;
    if (wc.amount < 1 || wc.amount > 50) {
      invalid.msg = "Amount of words must be between 1 and 50.";
      return invalid;
    }

    //check that word size is less than board size
    if (wc.minLength > this.config.size) {
      invalid.msg = "Word min length must be less than board size.";
      return invalid;
    }

    if (wc.maxLength > this.config.size) {
      invalid.msg = "Word max length should not be more than board size.";
      return invalid;
    }

    //validate that dictionary contains enough words
    if (wc.dictionary.length < wc.amount) {
      invalid.msg = "Amount of words cannot be greater than available ones.";
      return invalid;
    }

    //at least one direction
    if (this.config.allowedDirections.length < 1) {
      invalid.msg = "At least one direction must be specified";
      return invalid;
    }

    /**
     * TODO: more complex validations here like:
     * is webgame doable?
     * can we fit all those words?
     * etc
     */

    return {
      valid: true
    };
  };
}
