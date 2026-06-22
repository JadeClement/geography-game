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
        highlightCountryId: null,
        flashSmallCountryId: null,
        roundWrongCountryIds: [],
        flashWrongCountryIds: [],
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
  const setWrongCountryIds = useCallback(
    (ids) => dispatch({ type: "SET", patch: { wrongCountryIds: ids } }),
    []
  );
  const addWrongCountry = useCallback(
    (id) => dispatch({ type: "ADD_WRONG_COUNTRY", id }),
    []
  );
  const setRoundWrongCountryIds = useCallback(
    (ids) => dispatch({ type: "SET", patch: { roundWrongCountryIds: ids } }),
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
  const clearFlashWrongIfOnly = useCallback(
    (id) => dispatch({ type: "CLEAR_FLASH_WRONG_IF_ONLY", id }),
    []
  );
  const setFilledCountryIds = useCallback(
    (ids) => dispatch({ type: "SET", patch: { filledCountryIds: ids } }),
    []
  );
  const addFilledCountry = useCallback(
    (id) => dispatch({ type: "ADD_FILLED_COUNTRY", id }),
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
    (clearWrong) => dispatch({ type: "START_ROUND", clearWrong }),
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
    setWrongCountryIds,
    addWrongCountry,
    setRoundWrongCountryIds,
    addRoundWrongCountry,
    setFlashWrongCountryIds,
    clearFlashWrongIfOnly,
    setFilledCountryIds,
    addFilledCountry,
    setShowColorCountryIds,
    clearShowColorIfOnly,
    startGameBoard,
    startRoundBoard,
    finishGameBoard,
    resetBoard,
  };
}
