import { useCallback, useReducer } from "react";
import { useSyncRef } from "@/lib/hooks/useSyncRef";

const EMPTY_FEEDBACK = { text: "", type: "" };

/**
 * Everything that describes what the map/board currently shows. Grouping it in
 * one reducer means resets (start game, start round, finish game) flip the whole
 * board in a single action, so it is impossible to forget a field.
 */
const INITIAL_BOARD = {
  revealMode: false,
  feedback: EMPTY_FEEDBACK,
  highlightCountryId: null,
  flashSmallCountryId: null,
  wrongCountryIds: [],
  roundWrongCountryIds: [],
  flashWrongCountryIds: [],
  filledCountryIds: [],
  secondTryCountryIds: [],
  showColorCountryIds: [],
};

function addUnique(list, id) {
  return list.includes(id) ? list : [...list, id];
}

// A timeout fires to clear a one-off flash, but only if that flash is still the
// single entry it set (a newer round may have replaced it in the meantime).
function clearIfOnly(list, id) {
  return list.length === 1 && list[0] === id ? [] : list;
}

function boardReducer(state, action) {
  switch (action.type) {
    case "SET":
      return { ...state, ...action.patch };
    case "ADD_WRONG_COUNTRY":
      return { ...state, wrongCountryIds: addUnique(state.wrongCountryIds, action.id) };
    case "ADD_ROUND_WRONG_COUNTRY":
      return {
        ...state,
        roundWrongCountryIds: addUnique(state.roundWrongCountryIds, action.id),
      };
    case "ADD_FILLED_COUNTRY":
      return { ...state, filledCountryIds: addUnique(state.filledCountryIds, action.id) };
    case "ADD_SECOND_TRY_COUNTRY":
      return {
        ...state,
        secondTryCountryIds: addUnique(state.secondTryCountryIds, action.id),
      };
    case "CLEAR_FLASH_WRONG_IF_ONLY":
      return {
        ...state,
        flashWrongCountryIds: clearIfOnly(state.flashWrongCountryIds, action.id),
      };
    case "CLEAR_SHOW_COLOR_IF_ONLY":
      return {
        ...state,
        showColorCountryIds: clearIfOnly(state.showColorCountryIds, action.id),
      };
    case "START_GAME":
      return { ...INITIAL_BOARD, filledCountryIds: action.filledCountryIds ?? [] };
    case "START_ROUND":
      return {
        ...state,
        revealMode: false,
        feedback: EMPTY_FEEDBACK,
        // Learn passes clearHighlight: false — a dedicated effect owns the yellow
        // subject highlight and must not lose it to this reset.
        highlightCountryId:
          action.clearHighlight === false ? state.highlightCountryId : null,
        flashSmallCountryId: null,
        roundWrongCountryIds: [],
        flashWrongCountryIds: [],
        // Neighbor/compare teach paints must not carry into the next question.
        showColorCountryIds: [],
        // Learn between-question resets pass clearWrong and must not keep fills.
        filledCountryIds: action.clearWrong ? [] : state.filledCountryIds,
        secondTryCountryIds: action.clearWrong ? [] : state.secondTryCountryIds,
        // Progressive-fill levels keep accumulated wrong markers between rounds.
        wrongCountryIds: action.clearWrong ? [] : state.wrongCountryIds,
      };
    case "FINISH_GAME":
    case "RESET":
      return INITIAL_BOARD;
    default:
      return state;
  }
}

export function useGameBoard() {
  const [board, dispatch] = useReducer(boardReducer, INITIAL_BOARD);

  // Mirror revealMode so click/keyboard handlers can read it synchronously.
  const revealModeRef = useSyncRef(board.revealMode);

  const setFeedback = useCallback(
    (feedback) => dispatch({ type: "SET", patch: { feedback } }),
    []
  );
  const setRevealMode = useCallback(
    (value) => dispatch({ type: "SET", patch: { revealMode: value } }),
    []
  );
  const setHighlightCountryId = useCallback(
    (id) => dispatch({ type: "SET", patch: { highlightCountryId: id } }),
    []
  );
  const setFlashSmallCountryId = useCallback(
    (id) => dispatch({ type: "SET", patch: { flashSmallCountryId: id } }),
    []
  );
  const addWrongCountry = useCallback(
    (id) => dispatch({ type: "ADD_WRONG_COUNTRY", id }),
    []
  );
  const addRoundWrongCountry = useCallback(
    (id) => dispatch({ type: "ADD_ROUND_WRONG_COUNTRY", id }),
    []
  );
  const setFlashWrongCountryIds = useCallback(
    (ids) => dispatch({ type: "SET", patch: { flashWrongCountryIds: ids } }),
    []
  );
  const clearRoundWrongCountries = useCallback(
    () =>
      dispatch({
        type: "SET",
        patch: { roundWrongCountryIds: [], flashWrongCountryIds: [] },
      }),
    []
  );
  const clearFlashWrongIfOnly = useCallback(
    (id) => dispatch({ type: "CLEAR_FLASH_WRONG_IF_ONLY", id }),
    []
  );
  const addFilledCountry = useCallback(
    (id) => dispatch({ type: "ADD_FILLED_COUNTRY", id }),
    []
  );
  const addSecondTryCountry = useCallback(
    (id) => dispatch({ type: "ADD_SECOND_TRY_COUNTRY", id }),
    []
  );
  const setFilledCountryIds = useCallback(
    (ids) => dispatch({ type: "SET", patch: { filledCountryIds: ids } }),
    []
  );
  const setSecondTryCountryIds = useCallback(
    (ids) => dispatch({ type: "SET", patch: { secondTryCountryIds: ids } }),
    []
  );
  const setWrongCountryIds = useCallback(
    (ids) => dispatch({ type: "SET", patch: { wrongCountryIds: ids } }),
    []
  );
  const setShowColorCountryIds = useCallback(
    (ids) => dispatch({ type: "SET", patch: { showColorCountryIds: ids } }),
    []
  );
  const clearShowColorIfOnly = useCallback(
    (id) => dispatch({ type: "CLEAR_SHOW_COLOR_IF_ONLY", id }),
    []
  );
  const startGameBoard = useCallback(
    (filledCountryIds) => dispatch({ type: "START_GAME", filledCountryIds }),
    []
  );
  const startRoundBoard = useCallback(
    (clearWrong, { clearHighlight = true } = {}) =>
      dispatch({ type: "START_ROUND", clearWrong, clearHighlight }),
    []
  );
  const finishGameBoard = useCallback(() => dispatch({ type: "FINISH_GAME" }), []);
  const resetBoard = useCallback(() => dispatch({ type: "RESET" }), []);

  return {
    board,
    revealModeRef,
    setFeedback,
    setRevealMode,
    setHighlightCountryId,
    setFlashSmallCountryId,
    addWrongCountry,
    addRoundWrongCountry,
    setFlashWrongCountryIds,
    clearRoundWrongCountries,
    clearFlashWrongIfOnly,
    addFilledCountry,
    addSecondTryCountry,
    setFilledCountryIds,
    setSecondTryCountryIds,
    setWrongCountryIds,
    setShowColorCountryIds,
    clearShowColorIfOnly,
    startGameBoard,
    startRoundBoard,
    finishGameBoard,
    resetBoard,
  };
}
