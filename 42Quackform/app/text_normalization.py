from __future__ import annotations

import re
from functools import lru_cache
from typing import List

import spacy
from spacy.language import Language

from .errors import NormalizationError

_TRAILING_PUNCTUATION = "?!.,;:"
_WHITESPACE_RE = re.compile(r"\s+")

# Longer prefixes should come first to avoid partial matches swallowing detail.
_BOILERPLATE_PREFIXES: List[str] = [
    "i would like to ",
    "i'd like to ",
    "i want to learn how to ",
    "i want to practice ",
    "i want to learn ",
    "i want to speak ",
    "i want to play ",
    "i want to ",
]

def _strip_boilerplate_prefix(text: str) -> str:
    for prefix in _BOILERPLATE_PREFIXES:
        if text.startswith(prefix):
            return text[len(prefix) :]
    return text


@lru_cache(maxsize=1)
def _get_nlp() -> Language:
    try:
        return spacy.load("en_core_web_sm", disable=("parser", "ner", "textcat"))
    except OSError as exc:
        raise NormalizationError(
            "SpaCy model 'en_core_web_sm' is required. Install it via "
            "`python -m spacy download en_core_web_sm`."
        ) from exc


def _lemmatize_verbs(text: str) -> str:
    nlp = _get_nlp()
    doc = nlp(text)
    lemmas: List[str] = []
    for token in doc:
        if token.is_space:
            continue
        if token.pos_ == "VERB":
            lemma = token.lemma_
            if lemma == "-PRON-" or not lemma:
                lemma = token.text
            lemmas.append(lemma)
        else:
            lemmas.append(token.text)
    return " ".join(lemmas)


def normalize_text(raw: str, *, lemmatize_verbs: bool = True) -> str:
    if raw is None:
        raise NormalizationError("Cannot normalize missing text.")

    text = raw.strip()
    if not text:
        raise NormalizationError("Cannot normalize empty text.")

    text = text.lower()
    text = _strip_boilerplate_prefix(text).strip()
    text = _WHITESPACE_RE.sub(" ", text)
    text = text.rstrip(_TRAILING_PUNCTUATION).strip()

    if not text:
        raise NormalizationError("Text normalization removed all content.")

    if lemmatize_verbs:
        text = _lemmatize_verbs(text)

    return text
