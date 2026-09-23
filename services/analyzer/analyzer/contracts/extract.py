"""Run the contract extraction LLM call and add deterministic red flags."""

from analyzer.contracts.red_flags import derive_red_flags, merge_red_flags
from analyzer.contracts.terms import ContractTerms
from analyzer.llm.client import LLM
from analyzer.llm.prompt_loader import load_prompt
from analyzer.llm.types import Document, Part, Text

PROMPT_VERSION = "contract_v1"
OUTPUT_NAME = "record_contract_terms"
OUTPUT_DESCRIPTION = (
    "Record the contract's terms. Every term quotes the exact contract words it "
    "comes from; unstated terms are null."
)


def build_parts(*, text: str | None, pdf: bytes | None) -> list[Part]:
    if pdf is not None:
        return [
            Document(pdf, "application/pdf"),
            Text(f"This is a scanned contract. Record its terms with {OUTPUT_NAME}."),
        ]
    return [Text(f"<contract>\n{text}\n</contract>\n\nRecord its terms with {OUTPUT_NAME}.")]


def extract_terms(llm: LLM, *, text: str | None = None, pdf: bytes | None = None) -> ContractTerms:
    """Exactly one of `text` (extracted/pasted) or `pdf` (scanned) is given."""
    if (text is None) == (pdf is None):
        raise ValueError("pass exactly one of text or pdf")
    result = llm.structured(
        purpose="contract_terms",
        system=load_prompt(PROMPT_VERSION),
        parts=build_parts(text=text, pdf=pdf),
        output=ContractTerms,
        name=OUTPUT_NAME,
        description=OUTPUT_DESCRIPTION,
        max_tokens=16000,
    )
    terms = result.output
    terms.red_flags = merge_red_flags(terms.red_flags, derive_red_flags(terms))
    return terms
