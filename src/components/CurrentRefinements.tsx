import { CurrentRefinements } from 'react-instantsearch';

export function CurrentRefinementsPills() {
    return (
        <CurrentRefinements>
            {({ items, refine }) => (
                <div className="flex flex-wrap gap-2 mt-2">
                    {items.map(item =>
                            item.refinements.map(refinement => (
                                <span
                                    key={item.attribute + ':' + refinement.value}
                                    className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full dark:bg-blue-900 dark:text-blue-300 flex items-center"
                                    style={{ margin: 2 }}
                                >
                <span className="font-semibold mr-1">{item.label}:</span>
                                    {refinement.label}
                                    <button
                                        type="button"
                                        className="ml-1 text-blue-400 hover:text-blue-700 focus:outline-none cursor-pointer"
                                        onClick={() => refine(refinement)}
                                        aria-label={`Remove ${item.label}: ${refinement.label}`}
                                    >
                  &times;
                </button>
              </span>
                            ))
                    )}
                </div>
            )}
        </CurrentRefinements>
    );
}